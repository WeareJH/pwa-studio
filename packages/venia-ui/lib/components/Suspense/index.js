import React, { Suspense } from 'react';

const SSRSuspense = (props) => {
    if (globalThis.isSSR) {
		return props.children ? props.children : false;
	}
	else {
		return <Suspense {...props} />
	}
}

export default SSRSuspense;