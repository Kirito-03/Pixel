import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
export function playbackLockModule(react){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../../hooks/usePlaybackLock.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:()=>react});return exports;}
