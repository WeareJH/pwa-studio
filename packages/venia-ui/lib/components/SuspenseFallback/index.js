import React, { Suspense, useState, useEffect } from 'react';

const SSRSuspense = (props) => {
    const [isFront, setIsFront] = useState(false);

    useEffect(() => {
        process.nextTick(() => {
            if (globalThis.window) {
                setIsFront(true);
            }
        });
    }, []);

    if (!isFront) {
		return <>{null}</>
	}
	else {
		return <Suspense {...props} />
	}
}

export default SSRSuspense;