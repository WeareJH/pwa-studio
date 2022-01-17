import { handleActions } from 'redux-actions';
// import BrowserPersistence from '../../util/simplePersistence';

import actions from '../actions/user';

export const name = 'user';

const isSignedIn = () => (globalThis.storage ? !!globalThis.storage.getItem('signin_token') : false);

const initialState = {
    currentUser: {
        email: '',
        firstname: '',
        lastname: ''
    },
    getDetailsError: null,
    isGettingDetails: false,
    isResettingPassword: false,
    isSignedIn: isSignedIn(),
    resetPasswordError: null,
    token: globalThis.storage ? globalThis.storage.getItem('signin_token') : undefined,
};

const reducerMap = {
    [actions.setToken]: (state, { payload }) => {
        return {
            ...state,
            isSignedIn: true,
            token: payload
        };
    },
    [actions.clearToken]: state => {
        return {
            ...state,
            isSignedIn: false,
            token: null
        };
    },
    [actions.getDetails.request]: state => {
        return {
            ...state,
            getDetailsError: null,
            isGettingDetails: true
        };
    },
    [actions.getDetails.receive]: (state, { payload, error }) => {
        if (error) {
            return {
                ...state,
                getDetailsError: payload,
                isGettingDetails: false
            };
        }

        return {
            ...state,
            currentUser: payload,
            getDetailsError: null,
            isGettingDetails: false
        };
    },
    [actions.resetPassword.request]: state => ({
        ...state,
        isResettingPassword: true
    }),
    // TODO: handle the reset password response from the API.
    [actions.resetPassword.receive]: (state, { payload, error }) => {
        if (error) {
            return {
                ...state,
                isResettingPassword: false,
                resetPasswordError: payload
            };
        }

        return {
            ...state,
            isResettingPassword: false,
            resetPasswordError: null
        };
    },
    [actions.reset]: () => {
        return {
            ...initialState,
            isSignedIn: false,
            token: null
        };
    }
};

export default handleActions(reducerMap, initialState);