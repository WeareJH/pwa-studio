import { getInitialMagentoRoute } from '@magento/peregrine/lib/talons/MagentoRoute/useMagentoRoute';
import url from 'url'

const getInitialRequests = ({ req, apolloClient }) => {
	return new Promise ((resolve, reject) => {
		const parsedURL = url.parse(req.originalUrl);
		Promise.all([
			getInitialMagentoRoute(req.originalUrl, apolloClient),
		]).then(([routeData]) => {
			resolve({
				initialRouteData: {
					pathname: parsedURL?.pathname,
					...routeData
				},
			})
		}).catch((e) => {
			reject(e);
		})
	});
}

export default getInitialRequests;