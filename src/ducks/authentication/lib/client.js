/* global cozy __APP_VERSION__ */
import { CozyClient } from 'cozy-client'
import { LocalStorage as Storage } from 'cozy-client-js'
import { offlineDoctypes as doctypes } from 'doctypes'
import getPermissions from 'utils/getPermissions'
import { getDeviceName } from 'cozy-device-helper'

const SOFTWARE_ID = 'io.cozy.banks.mobile'
const SOFTWARE_NAME = 'Cozy Banks'
const getLang = () =>
  navigator && navigator.language ? navigator.language.slice(0, 2) : 'en'

export function resetClient(clientInfo, client) {
  // reset cozy-bar
  if (document.getElementById('coz-bar')) {
    document.getElementById('coz-bar').remove()
  }
  // reset pouchDB
  if (client && client.resetStore) {
    client.resetStore()
  }
  // unregister the client
  if (clientInfo && cozy.client.auth.unregisterClient) {
    cozy.client.auth.unregisterClient(clientInfo)
  }
  // reset cozy-client-js
  if (cozy.client._storage) {
    cozy.client._storage.clear()
  }
}

export const getToken = async () => {
  try {
    const response = await cozy.client.authorize()
    return response.token
  } catch (e) {
    throw e
  }
}

export const initClient = url => {
  return new CozyClient({
    cozyURL: url,
    oauth: {
      storage: new Storage(),
      clientParams: {
        redirectURI: 'cozybanks://auth',
        softwareID: SOFTWARE_ID,
        clientName: `${SOFTWARE_NAME} (${getDeviceName()})`,
        softwareVersion: __APP_VERSION__,
        clientKind: 'mobile',
        clientURI: 'https://github.com/cozy/cozy-banks',
        logoURI:
          'https://downcloud.cozycloud.cc/upload/cozy-banks/email-assets/logo-bank.png',
        policyURI: 'https://files.cozycloud.cc/cgu.pdf',
        scopes: getPermissions(),
        notificationPlatform: 'firebase'
      }
    },
    offline: { doctypes }
  })
}

export const initBar = (url, accessToken, options = {}) => {
  cozy.bar.init({
    appName: 'Banks',
    appEditor: 'Cozy',
    cozyURL: url,
    token: accessToken,
    iconPath: require('targets/favicons/icon-banks.svg'),
    lang: getLang(),
    replaceTitleOnMobile: true,
    displayOnMobile: true,
    ...options
  })
}

export const updateAccessTokenBar = accessToken => {
  cozy.bar.updateAccessToken(accessToken)
}