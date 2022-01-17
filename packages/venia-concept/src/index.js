import React from 'react';
import app from '@magento/peregrine/lib/store/actions/app';
import { hydrate } from 'react-dom';
import { registerSW } from './registerSW';
import Adapter from '@magento/venia-ui/lib/components/Adapter';
import { loadableReady } from '@loadable/component'
import './index.css';

import store from './store';
import { BrowserPersistence } from '@magento/peregrine/lib/util';
import { hydrateInitialMagentoRoute } from '@magento/peregrine/lib/talons/MagentoRoute/useMagentoRoute';

const styles = new Set();

globalThis.storage = new BrowserPersistence();


loadableReady(() => {
    hydrateInitialMagentoRoute().then(() => {
        hydrate(<Adapter origin={globalThis.location.origin} store={store} styles={styles} />, document.getElementById('root'));
        registerSW();
    })
});

globalThis.addEventListener('online', () => {
    store.dispatch(app.setOnline());
});
globalThis.addEventListener('offline', () => {
    store.dispatch(app.setOffline());
});