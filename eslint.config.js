// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // react-three-fiber renders three.js objects as JSX intrinsics
    // (mesh, cylinderGeometry, position, args, ...) that eslint-plugin-react
    // doesn't recognize as valid DOM/RN props.
    files: ["src/features/trick-viz/**/*.tsx", "src/features/kendama-model/**/*.tsx"],
    rules: {
      "react/no-unknown-property": "off",
    },
  },
]);
