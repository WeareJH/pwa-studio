import Cookies from 'universal-cookie'
const SEPERATOR = '__';
/**
 * Persistence layer with expiration based on localStorage.
 */

const storageMock = {
    length: 0,
    getItem() {},
    setItem() {},
    removeItem() {},
    clear() {}
};

class CookieStorageInstance {
    constructor() {
        this.cookies = globalThis.isSSR ? new Cookies(globalThis.req?.headers?.cookie, globalThis.res?.headers?.cookie) : new Cookies();
    }
    getItem(key) {
        return this.cookies.get(key, { path: '/', doNotParse: true });
    }
    setItem(name, value) {
        return this.cookies.set(name, value, { path: '/' });
    }
    removeItem(name) {
        return this.cookies.remove(name, { path: '/'});
    }
    getAll() {
        return this.cookies.getAll({ doNotParse: true });
    }
    
}

class NamespacedLocalStorage {
    constructor(localStorage, key) {
        this.localStorage = localStorage;
        this.key = key;
    }
    _makeKey(key) {
        return `${this.key}${SEPERATOR}${key}`;
    }
    getItem(name) {
        return this.localStorage.getItem(this._makeKey(name));
    }
    setItem(name, value) {
        return this.localStorage.setItem(this._makeKey(name), value);
    }
    removeItem(name) {
        return this.localStorage.removeItem(this._makeKey(name));
    }
    getAll() {
        return this.localStorage.getAll ? this.localStorage.getAll() : {};
    }
}

export default class BrowserPersistence {
    static KEY = PERSISTENCE_KEY;
    /* istanbul ignore next: test injects localstorage mock */
    constructor(localStorage = USE_COOKIES ? new CookieStorageInstance : (globalThis.localStorage || storageMock)) {
        this.storageKey = this.constructor.KEY || BrowserPersistence.KEY;
        this.storage = new NamespacedLocalStorage(
            localStorage,
            this.storageKey
        );
    }
    getRawItem(name) {
        return this.storage.getItem(name);
    }
    getItem(name) {
        const item = this.storage.getItem(name);
        if (!item) {
            return undefined;
        }
        try {
            const { value } = JSON.parse(item);
    
            return JSON.parse(value);
        }
        catch(e) {
            return undefined;
        }
    }
    setItem(name, value, ttl) {
        const timeStored = Date.now();
        this.storage.setItem(
            name,
            JSON.stringify({
                value: JSON.stringify(value),
                timeStored,
                ttl
            })
        );
    }
    removeItem(name) {
        this.storage.removeItem(name);
    }
    getAll() {
        try {
            const storageData = this.storage.getAll();
            const filteredResults = Object.keys(storageData).sort().reduce((obj, key) => {
                if(key.startsWith(this.storageKey+SEPERATOR)) {
                    obj[key] = JSON.parse(storageData[key]).value;
                }
                return obj;
            }, {})

            return filteredResults;
        }
        catch(e) {
            console.log('err?', e);
            return []
        }
    }
}
