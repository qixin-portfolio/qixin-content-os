/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveTypeScript(request, parent, isMain, options) {
  try {
    return resolveFilename.call(this, request, parent, isMain, options);
  } catch (error) {
    if (!request.startsWith(".")) throw error;
    const candidate = path.resolve(path.dirname(parent.filename), `${request}.ts`);
    if (fs.existsSync(candidate)) return candidate;
    throw error;
  }
};

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

require("./content-remote.ts");
