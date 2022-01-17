import { ApolloLink, createHttpLink } from '@apollo/client';
import { InMemoryCache } from '@apollo/client/cache';
import { ApolloClient } from '@apollo/client/core';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import { RetryLink } from '@apollo/client/link/retry';
import { CachePersistor } from 'apollo-cache-persist';
import getWithPath from 'lodash.get';
import setWithPath from 'lodash.set';
// import { useEffect, useMemo, useState, useCallback } from 'react';

import MutationQueueLink from '@adobe/apollo-link-mutation-queue';
import attachClient from '@magento/peregrine/lib/Apollo/attachClientToStore';
import { CACHE_PERSIST_PREFIX } from '@magento/peregrine/lib/Apollo/constants';
import typePolicies from '@magento/peregrine/lib/Apollo/policies';
import MagentoGQLCacheLink from '@magento/peregrine/lib/Apollo/magentoGqlCacheLink';
import { BrowserPersistence } from '@magento/peregrine/lib/util';
import shrinkQuery from '@magento/peregrine/lib/util/shrinkQuery';

const createServerAdapter = async ({ origin, store, styles, ...props}) => {
	const storeCode = (globalThis.storage.getItem('store_view_code') || STORE_VIEW_CODE);
	const basename = (urlHasStoreCode && storeCode) ? `/${storeCode}` : undefined;
	const apiBase = new URL('/graphql', origin).toString()

	const authLink = setContext((_, { headers }) => {
		// get the authentication token from local storage if it exists.
		const token = globalThis.storage.getItem('signin_token');

		// return the headers to the context so httpLink can read them
		return {
			headers: {
				...headers,
				authorization: token ? `Bearer ${token}` : ''
			}
		};
	});

	const errorLink = onError(handler => {
		const { graphQLErrors, networkError, response } = handler;

		if (graphQLErrors) {
			graphQLErrors.forEach(({ message, locations, path }) =>
				console.log(
					`[GraphQL error]: Message: ${message}, Location: ${locations}, Path: ${path}`
				)
			);
		}

		if (networkError) {
			console.log(`[Network error]: ${networkError}`);
		}

		if (response) {
			const { data, errors } = response;
			let pathToCartItems;

			// It's within the GraphQL spec to receive data and errors, where
			// errors are merely informational and not intended to block. Almost
			// all existing components were not built with this in mind, so we
			// build special handling of this error message so we can deal with
			// it at the time we deem appropriate.
			errors.forEach(({ message, path }, index) => {
				if (
					message ===
						'Some of the products are out of stock.' ||
					message ===
						'There are no source items with the in stock status'
				) {
					if (!pathToCartItems) {
						pathToCartItems = path.slice(0, -1);
					}

					// Set the error to null to be cleaned up later
					response.errors[index] = null;
				}
			});

			// indicator that we have some cleanup to perform on the response
			if (pathToCartItems) {
				const cartItems = getWithPath(data, pathToCartItems);
				const filteredCartItems = cartItems.filter(
					cartItem => cartItem !== null
				);
				setWithPath(data, pathToCartItems, filteredCartItems);

				const filteredErrors = response.errors.filter(
					error => error !== null
				);
				// If all errors were stock related and set to null, reset the error response so it doesn't throw
				response.errors = filteredErrors.length
					? filteredErrors
					: undefined;
			}
		}
	});

	const httpLink = createHttpLink({
		fetch: customFetchToShrinkQuery,
		useGETForQueries: true,
		uri: apiBase
	});

	const mutationQueueLink = new MutationQueueLink();

	const retryLink = new RetryLink({
		delay: {
			initial: 300,
			max: Infinity,
			jitter: true
		},
		attempts: {
			max: 5,
			retryIf: error => error,
		}
	});

	const storeLink = setContext((_, { headers }) => {
		const storeCurrency =
			globalThis.storage.getItem('store_view_currency') || null;
		const storeCode =
			globalThis.storage.getItem('store_view_code') || STORE_VIEW_CODE;

		// return the headers to the context so httpLink can read them
		return {
			headers: {
				...headers,
				store: storeCode,
				...(storeCurrency && {
					'Content-Currency': storeCurrency
				})
			}
		};
	});

	const magentoGqlCacheLink = new MagentoGQLCacheLink();

	const apolloLink = ApolloLink.from([
		// preserve this array order, it's important
		// as the terminating link, `httpLink` must be last
		mutationQueueLink,
		retryLink,
		authLink,
		magentoGqlCacheLink,
		storeLink,
		errorLink,
		httpLink
	]);

	const apolloClient = ((apiBase, apolloLink) => {
		// const storeCode = globalThis.storage.getItem('store_view_code') || 'default';

		const client = new ApolloClient({
			cache: createPreInstantiatedCache(),
			link: apolloLink,
			ssrMode: true,
		});

		// const persistor = 
		// 	new CachePersistor({
		// 		key: `${CACHE_PERSIST_PREFIX}-${storeCode}`,
		// 		cache: preInstantiatedCache,
		// 		// storage: globalThis.localStorage,
		// 		storage: globalThis.storage,
		// 		debug: process.env.NODE_ENV === 'development'
		// 	});

		client.apiBase = apiBase;
		client.persistor = null;

		return client;
	})(apiBase, apolloLink);

	// const getUserConfirmation = useCallback(async (message, callback) => {
	// 	if (typeof globalThis.handleRouteChangeConfirmation === 'function') {
	// 		return globalThis.handleRouteChangeConfirmation(message, callback);
	// 	}

	// 	return callback(globalThis.confirm(message));
	// }, []);

	const apolloProps = { client: apolloClient };
	const reduxProps = { store };
	const routerProps = { basename };
	const styleProps = { initialState: styles };

	// await apolloClient.persistor.restore();
	await attachClient(apolloClient);


	return {
        apolloProps,
        reduxProps,
        routerProps,
        styleProps,
        urlHasStoreCode
    }

}

// const storage = new BrowserPersistence();
const urlHasStoreCode = process.env.USE_STORE_CODE_IN_URL === 'true';

/**
 * To improve initial load time, create an apollo cache object as soon as
 * this module is executed, since it doesn't depend on any component props.
 * The tradeoff is that we may be creating an instance we don't end up needing.
 */
const createPreInstantiatedCache = () => {
	return new InMemoryCache({
		// POSSIBLE_TYPES is injected into the bundle by webpack at build time.
		possibleTypes: POSSIBLE_TYPES,
		typePolicies
	});
}

/**
 * Intercept and shrink URLs from GET queries.
 *
 * Using GET makes it possible to use edge caching in Magento Cloud, but risks
 * exceeding URL limits with default usage of Apollo's http link.
 *
 * `shrinkQuery` encodes the URL in a more efficient way.
 *
 * @param {*} uri
 * @param {*} options
 */
const customFetchToShrinkQuery = (uri, options) => {
    // TODO: add `ismorphic-fetch` or equivalent to avoid this error
    if (typeof globalThis.fetch !== 'function') {
        console.error('This environment does not define `fetch`.');
        return () => {};
    }

    const resource = options.method === 'GET' ? shrinkQuery(uri) : uri;

    return globalThis.fetch(resource, options);
};

export default createServerAdapter;