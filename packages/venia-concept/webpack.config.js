const webpack = require('webpack');
const { configureWebpack, graphQL } = require('@magento/pwa-buildpack');
const fs = require('fs');
const path = require('path');

// Webpack Plugins
const HTMLWebpackPlugin = require('html-webpack-plugin');
const LoadablePlugin = require('@loadable/webpack-plugin');
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
// const nodeExternals = require('webpack-node-externals');

// Component Override Plugin
// const NormalModuleOverridePlugin = require('./src/plugins/normalModuleOverrideWebpackPlugin');
// const componentOverrideMapping = require('./componentOverrideMapping');


const {
    getMediaURL,
    getStoreConfigData,
    getAvailableStoresConfigData,
    getPossibleTypes
} = graphQL;

const { DefinePlugin } = webpack;
const { LimitChunkCountPlugin } = webpack.optimize;

const getCleanTemplate = templateFile => {
    return new Promise(resolve => {
        fs.readFile(templateFile, 'utf8', (err, data) => {
            resolve(
                data.replace(
                    /(?<inlineddata><!-- Inlined Data -->.*\s<!-- \/Inlined Data -->)/gs,
                    ''
                )
            );
        });
    });
};

module.exports = async env => {
    /**
     * configureWebpack() returns a regular Webpack configuration object.
     * You can customize the build by mutating the object here, as in
     * this example. Since it's a regular Webpack configuration, the object
     * supports the `module.noParse` option in Webpack, documented here:
     * https://webpack.js.org/configuration/module/#modulenoparse
     */
    const config = await configureWebpack({
        context: __dirname,
        vendor: [
            '@apollo/client',
            'apollo-cache-persist',
            'informed',
            'react',
            'react-dom',
            'react-feather',
            'react-redux',
            'react-router-dom',
            'redux',
            'redux-actions',
            'redux-thunk'
        ],
        special: {
            'react-feather': {
                esModules: true
            }
        },
        env
    });

    // config.stats = { children: false };
    config.stats = 'minimal';

    const mediaUrl = await getMediaURL();
    const storeConfigData = await getStoreConfigData();
    const { availableStores } = await getAvailableStoresConfigData();

    /**
     * Loop the available stores when there is provided STORE_VIEW_CODE
     * in the .env file, because should set the store name from the
     * given store code instead of the default one.
     */
    const availableStore = availableStores.find(
        ({ code }) => code === process.env.STORE_VIEW_CODE
    );

    global.MAGENTO_MEDIA_BACKEND_URL = mediaUrl;
    global.LOCALE = storeConfigData.locale.replace('_', '-');
    global.AVAILABLE_STORE_VIEWS = availableStores;

    const possibleTypes = await getPossibleTypes();

    const htmlWebpackConfig = {
        filename: 'index.html',
        minify: {
            collapseWhitespace: true,
            removeComments: true
        },
        inject: false,
    };

    // Strip UPWARD mustache from template file during watch
    if (
        process.env.npm_lifecycle_event &&
        process.env.npm_lifecycle_event.includes('watch')
    ) {
        htmlWebpackConfig.templateContent = await getCleanTemplate(
            './template.html'
        );
    } else {
        htmlWebpackConfig.template = './template.html';
    }

    config.module.noParse = [
        /@adobe\/adobe\-client\-data\-layer/,
        /braintree\-web\-drop\-in/
    ];

    const sharedPluginInjections = {
        /**
         * Make sure to add the same constants to
         * the globals object in jest.config.js.
         */
        POSSIBLE_TYPES: JSON.stringify(possibleTypes),
        STORE_NAME: availableStore
            ? JSON.stringify(availableStore.store_name)
            : JSON.stringify(storeConfigData.store_name),
        STORE_VIEW_CODE: process.env.STORE_VIEW_CODE
            ? JSON.stringify(process.env.STORE_VIEW_CODE)
            : JSON.stringify(storeConfigData.code),
        AVAILABLE_STORE_VIEWS: JSON.stringify(availableStores),
        DEFAULT_LOCALE: JSON.stringify(global.LOCALE),
        DEFAULT_COUNTRY_CODE: JSON.stringify(
            process.env.DEFAULT_COUNTRY_CODE || 'US'
        ),
        __DEV__: process.env.NODE_ENV !== 'production',
        USE_COOKIES: process.env.USE_COOKIES || false,
        SUPPORT_SSR: process.env.SUPPORT_SSR || false,
        PERSISTENCE_KEY: process.env.PERSISTENCE_KEY ? JSON.stringify(process.env.PERSISTENCE_KEY) : 'M2_VENIA_PERSISTENCE',
    }

    config.plugins = [
        ...config.plugins,
        new HTMLWebpackPlugin(htmlWebpackConfig),
        new LoadablePlugin(),
        new MiniCssExtractPlugin(),
        // new NormalModuleOverridePlugin(componentOverrideMapping),
    ];

    config.output = {
        ...config.output,
        path: path.resolve(__dirname, 'dist/client'),
    }

    // SHOW CONSOLE LOGS FOR DEBUGGING
    if(config.optimization.minimizer && config.optimization.minimizer.length > 0) {
        config.optimization.minimizer[0].options.terserOptions.compress.drop_console = false;
        config.optimization.minimizer[0].options.minify = false;
    }
    // // ESCAPE THIS ON PRODUCTION

    // Inject MiniCssExtractPlugin loader into CSS rules
    config.module.rules = config.module.rules.map(rule => {
        if (`${rule.test}` === '/\\.css$/') {
            return {
                ...rule,
                oneOf: rule.oneOf.map(ruleConfig => ({
                    ...ruleConfig,
                    use: [
                        MiniCssExtractPlugin.loader,
                        ...ruleConfig.use.filter(
                            loaderConfig => loaderConfig.loader !== 'style-loader'
                        )
                    ]
                }))
            };
        }
        return rule;
    });

    // TODO: get LocalizationPlugin working in Node
    const browserPlugins = new Set()
        .add('HtmlWebpackPlugin')
        .add('LocalizationPlugin')
        .add('ServiceWorkerPlugin')
        .add('VirtualModulesPlugin')
        .add('WebpackAssetsManifest');

    const serverConfig = Object.assign({}, config, {
        target: 'node',
        // externals: [nodeExternals()],
        externals: [
            {
                canvas: '{}',
            },
        ],
        devtool: false,
        module: { ...config.module },
        name: 'server-config',
        entry: {
            server: './src/ssr-server/index.js',
        },
        output: {
            ...config.output,
            path: path.resolve(__dirname, 'dist/server'),
            filename: 'ssr-server.js',
            strictModuleExceptionHandling: true
        },
        optimization: {
            minimize: false,
            splitChunks: {
                cacheGroups: {
                    styles: {
                        name: 'styles',
                        // type: 'css/mini-extract',
                        test: /\.css$/,
                        chunks: 'all',
                        enforce: true,
                    },
                },
            },
        },
        plugins: [
            ...config.plugins.filter(
                plugin => !browserPlugins.has(plugin.constructor.name)
            ),
            new DefinePlugin({
                __fetchLocaleData__: async () => {
                   // no-op in server side
               },
               ...sharedPluginInjections,
            }),
            // add LimitChunkCountPlugin to avoid code splitting
            new LimitChunkCountPlugin({
                maxChunks: 1
            }),
        ],
        resolve: {
            ...config.resolve,
            mainFields: [ 'esnext', 'es2015', 'module', 'main', 'browser' ],
        }
    });

    config.plugins = [
        ...config.plugins,
        new DefinePlugin({
            ...sharedPluginInjections,
        }),
    ]

    return [serverConfig, config];
};
