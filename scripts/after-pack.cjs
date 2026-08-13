// electron-builder afterPack hook.
// electronDist points at the local node_modules/electron/dist (so dev and
// packaged builds share the same Electron binary); that raw Electron.app
// ships its own placeholder default_app.asar, which electron-builder does
// not strip when copying a *custom* unpacked distribution the way it does
// for its own downloaded/cached Electron zips. Left in place it's dead
// weight and a second, unrelated "app" living inside our app bundle.
const fs = require("fs");
const path = require("path");

module.exports = async function afterPack(context) {
  const resourcesDir = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources");
  const defaultAppAsar = path.join(resourcesDir, "default_app.asar");
  if (fs.existsSync(defaultAppAsar)) {
    fs.rmSync(defaultAppAsar, { force: true });
    console.log(`[afterPack] removed stray default_app.asar: ${defaultAppAsar}`);
  }
};
