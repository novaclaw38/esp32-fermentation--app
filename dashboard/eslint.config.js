import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// ESLint 9 only reads flat config; the old .eslintrc.cjs was silently
// ignored, so `npm run lint` failed before checking a single file.
export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    // Context modules export a provider and its hook together on purpose
    // (lib/auth.tsx, lib/tempUnitContext.tsx); splitting them buys nothing.
    files: ["src/lib/auth.tsx", "src/lib/tempUnitContext.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },
);
