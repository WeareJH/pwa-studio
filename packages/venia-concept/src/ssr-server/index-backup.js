import express from 'express';
import compression from 'compression';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import proxy from 'express-http-proxy';
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
// import { getInitialMagentoRoute } from '@magento/peregrine/lib/talons/MagentoRoute/useMagentoRoute';

// Fallbacks
import fetch from 'node-fetch'
globalThis.fetch = fetch;
globalThis.isSSR = true;

// const htmlparser2 = require("htmlparser2");
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
const storeAdapters = new Map();

const getAppConfig = ((storeCode) => {
    return new Promise((resolve, reject) => {
        const cachedAdapter = storeAdapters.get(storeCode)
        if(cachedAdapter) {
            resolve(cachedAdapter);
        }
        else {
            createServerAdapter({ origin: process.env.MAGENTO_BACKEND_URL, styles: new Set(), store: store, storeCode: storeCode }).then(newAdapter => {
                storeAdapters.set(storeCode, newAdapter);
                resolve(storeAdapters.get(storeCode));
            }).catch(e => { reject(e); });
        }
    });
})

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

app.use('*', (req, res, next) => {
    fs.readFile(path.resolve('./dist/client/index.html'), 'utf-8', (err, indexHTML) => {
        if (err) {
            console.log(err);
            return res.status(500).send('Some error happened');
        }

        globalThis.helmetContext = {};

        // const origin = process.env.MAGENTO_BACKEND_URL;
        // const styles = new Set();

        // createServerAdapter({ origin: origin, styles: styles, store: store }).then(({apolloProps, reduxProps, routerProps, urlHasStoreCode}) => {
        getAppConfig(STORE_VIEW_CODE).then(({apolloProps, reduxProps, routerProps, urlHasStoreCode}) => {
            getInitialRequests({ url: req.originalUrl, apolloClient: apolloProps.client }).then(({ initialRoute, pageSizeData }) => {
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
                    const apolloState = apolloProps.client.extract();
                    const { helmet } = helmetContext;
                    
                    const compiledHTML = indexHTML
                        .replace('</head>', `${appLinks}${appStyles}${helmet.title.toString()}
                        ${helmet.meta.toString()}
                        ${helmet.link.toString()}</head>`)
                        .replace(/(<div id="root">)[\S\s]*?(<\/div><noscript>)/,
                        `<div id="root">${appHTML}</div><script>window.__APOLLO_STATE__=${JSON.stringify(apolloState).replace(/</g, '\\u003c')};</script>${appScripts}<noscript>`);
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
});

const serverPort = process.env.STAGING_SERVER_PORT ? process.env.STAGING_SERVER_PORT : 8001;

app.listen(serverPort, () => {
    console.log(`SSR server launched on ${serverPort}`);
});