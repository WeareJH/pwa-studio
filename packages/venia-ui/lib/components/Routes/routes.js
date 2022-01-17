import React from 'react';
import { Route, Switch, useLocation } from 'react-router-dom';

import { useScrollTopOnChange } from '@magento/peregrine/lib/hooks/useScrollTopOnChange';
import HomePage from '../HomePage';
import MagentoRoute from '../MagentoRoute';
// import { fullPageLoadingIndicator } from '../LoadingIndicator';
// import Suspense from '../Suspense'

const Routes = () => {
    const { pathname } = useLocation();
    useScrollTopOnChange(pathname);

    return (
        <Switch>
            {/*
                * Client-side routes are injected by BabelRouteInjectionPlugin here.
                * Venia's are defined in packages/venia-ui/lib/targets/venia-ui-intercept.js
                */}
            <Route>
                <MagentoRoute />
                {/*
                    * The Route below is purposefully nested with the MagentoRoute above.
                    * MagentoRoute renders the CMS page, and HomePage adds a stylesheet.
                    * HomePage would be obsolete if the CMS could deliver a stylesheet.
                    */}
                <Route exact path="/">
                    <HomePage />
                </Route>
            </Route>
        </Switch>
    );
};

export default Routes;
const availableRoutes = [];
export { availableRoutes };
