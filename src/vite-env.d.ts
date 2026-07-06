// Vite 环境与构建期注入的全局变量类型声明

/** 应用版本号，由 vite.config.ts 在构建时通过 git commit hash 注入 */
declare const __APP_VERSION__: string;
