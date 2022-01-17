import express from 'express';
import compression from 'compression';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import proxy from 'express-http-proxy';
import NodeCache from 'node-cache';
import { ChunkExtractor } from '@loadable/server'

import React from 'react';
// import ReactDOMServer from 'react-dom/server'
import store from '../store';
import createServerAdapter from './createServerAdapter'
import getInitialRequests from './getInitialRequests'

// App Components
import { ApolloProvider } from '@apollo/client';
import { renderToStringWithData } from "@apollo/client/react/ssr";
import { Provider as ReduxProvider } from 'react-redux';
import { StaticRouter } from 'react-router-dom';
import App, { AppContextProvider } from '@magento/venia-ui/lib/components/App';
import StoreCodeRoute from '@magento/venia-ui/lib/components/StoreCodeRoute';
import { BrowserPersistence } from '@magento/peregrine/lib/util';
import { GQL_STATE_ID } from '@magento/peregrine/lib/Apollo/constants';

// Fallbacks
import fetch from 'node-fetch'
globalThis.fetch = fetch;
globalThis.isSSR = true;

const jsdom = require("jsdom");

dotenv.config();

class DOMParser {
    constructor() {
    }
    parseFromString(htmlStr = '', contentType = 'text/html') {
        return (new jsdom.JSDOM(htmlStr, { contentType: contentType })).window.document;
    }
}

global.DOMParser = DOMParser;

// Adapters
// const storeAdapters = new Map();

const getAppConfig = ((storeCode) => {
    return new Promise((resolve, reject) => {
        // const cachedAdapter = storeAdapters.get(storeCode)
        // if(cachedAdapter) {
        //     resolve(cachedAdapter);
        // }
        // else {
            createServerAdapter({ origin: process.env.MAGENTO_BACKEND_URL, styles: new Set(), store: store, storeCode: storeCode }).then(newAdapter => {
                // storeAdapters.set(storeCode, newAdapter);
                // resolve(storeAdapters.get(storeCode));
                resolve(newAdapter);
            }).catch(e => { reject(e); });
        // }
    });
})

const appState = ({ apolloState, initialRouteData }) => {
    const scripts = `
        ${apolloState ? `<script type="text/json" id="${GQL_STATE_ID}">${JSON.stringify(apolloState).replace(/</g, '\\u003c')}</script>` : ''}
        ${initialRouteData ? `<script type="text/json" id="initial-route-data">${JSON.stringify(initialRouteData).replace(/</g, '\\u003c')}</script>` : ''}
    `;
    return scripts;
}

const pageCache = new NodeCache({ stdTTL: 10000 });

const globalsMiddleware = (req, res, next) => {
    globalThis.req = req;
    globalThis.res = res;
    globalThis.storage = new BrowserPersistence();

    return next();
}

const pageCacheMiddleware = (req, res, next) => {
    try {
        // return next();
        res.requestHash = req.originalUrl + '|' + JSON.stringify(globalThis.storage.getAll());

        if(pageCache.has(res.requestHash)) {
            res.cachedHTML = pageCache.get(res.requestHash);
            return next();
        }
        else {
            return next();
        }
    }
    catch (err) {
        return next();
        // throw new Error(err);
    }
};

const app = express();
app.use(compression());

app.all(new RegExp('^/(graphql|rest|media)(/|$)'), proxy(process.env.MAGENTO_BACKEND_URL));

app.get(
    new RegExp('^/(robots.txt|favicon.ico|manifest.json)'),
    express.static(path.resolve('./dist/client/venia-static/'))
);

app.get(
    new RegExp('(js|json|png|svg|ico|css|txt|woff|woff2)'),
    express.static(path.resolve('./dist/client/'))
);

app.use('*', globalsMiddleware, pageCacheMiddleware, (req, res, next) => {
    if(res.cachedHTML) {
        return res.send(res.cachedHTML);
    }
    else {
        fs.readFile(path.resolve('./dist/client/index.html'), 'utf-8', (err, indexHTML) => {
            if (err) {
                console.log(err);
                return res.status(500).send('Some error happened');
            }
    
            globalThis.helmetContext = {};
            
            getAppConfig(STORE_VIEW_CODE).then(({apolloProps, reduxProps, routerProps, urlHasStoreCode}) => {
                globalThis.apolloClient = apolloProps.client;
                getInitialRequests({ req: req, apolloClient: globalThis.apolloClient }).then(({ initialRouteData }) => {
                    const webStats = path.resolve('./dist/client/loadable-stats.json')
                    
                    const storeCodeRouteHandler = urlHasStoreCode ? <StoreCodeRoute /> : null;
        
                    const webExtractor = new ChunkExtractor({ statsFile: webStats, entrypoints: ['client'] })
                    const AppJSX = webExtractor.collectChunks(
                        <ApolloProvider {...apolloProps}>
                            <ReduxProvider {...reduxProps}>
                                <StaticRouter location={req.originalUrl} {...routerProps} context={{}}>
                                    {storeCodeRouteHandler}
                                    <AppContextProvider>
                                        <App />
                                    </AppContextProvider>
                                </StaticRouter>
                            </ReduxProvider>
                        </ApolloProvider>
                    )
        
                    renderToStringWithData(AppJSX).then((appHTML) => {
                        const appScripts = webExtractor.getScriptTags();
                        const appLinks = webExtractor.getLinkTags();
                        const appStyles = webExtractor.getStyleTags();
                        const apolloState = globalThis.apolloClient.extract();
                        const { helmet } = helmetContext;
                        
                        const compiledHTML = indexHTML
                            .replace('</head>', `${appLinks}${appStyles}${helmet.title.toString()}
                            ${helmet.meta.toString()}
                            ${helmet.link.toString()}</head>`)
                            .replace('<div id="root"></div><noscript>',
                            `<div id="root">
                                ${appHTML}
                            </div>
                                ${appState({
                                    apolloState: apolloState,
                                    initialRouteData: initialRouteData,
                                })}${appScripts}
                            <noscript>`);
                            if(res.requestHash) {
                                pageCache.set(res.requestHash, compiledHTML)
                            }
                        return res.send(compiledHTML);
                    })
                }).catch((e) => {
                    console.warn('Error rendering the page:', e);
                    return res.send(indexHTML);
                })
    
    
            }).catch((e) => {
                console.warn('Error rendering the page:', e);
                return res.send(indexHTML);
            })
        });
    }
});

const serverPort = process.env.STAGING_SERVER_PORT ? process.env.STAGING_SERVER_PORT : 8001;

app.listen(serverPort, () => {
    console.log(`SSR server launched on ${serverPort}`);
});