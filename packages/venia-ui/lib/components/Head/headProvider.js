import React from 'react';
import { HelmetProvider as HeadProvider } from 'react-helmet-async';

const VeniaHeadProvider = props => {
    return <HeadProvider context={globalThis?.helmetContext}>{props.children}</HeadProvider>;
};

export default VeniaHeadProvider;
