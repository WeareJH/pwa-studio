const readJson = (selector) => {
	const elem = document.getElementById(selector);
	try {
		if (!elem) {
			return {};
		}
		return JSON.parse(elem.textContent || '');
	} catch (e) {
		console.error(e);
		return {};
	}
}

export default readJson;