import { bundleID, companyName, productName, version } from './package.json'

/** This fork's standalone build, installed next to the official app. */
const forkProductName = 'GitHub Desktop Blazium'
const forkBundleID = 'com.blazium.GitHubDesktopBlazium'

export function getProductName() {
  return process.env.NODE_ENV === 'development'
    ? `${productName}-dev`
    : forkProductName
}

export function getCompanyName() {
  return companyName
}

export function getVersion() {
  return version
}

export function getBundleID() {
  return process.env.NODE_ENV === 'development'
    ? `${bundleID}Dev`
    : forkBundleID
}
