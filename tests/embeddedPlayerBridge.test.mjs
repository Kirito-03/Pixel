import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../utils/embeddedPlayerBridge.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
function page(media) {
  const messages=[];const handlers={};let intervals=0;
  const scope={window:{ReactNativeWebView:{postMessage:value=>messages.push(value)}},document:{querySelector:()=>media,querySelectorAll:()=>[],addEventListener:(key,fn)=>handlers[key]=fn},setInterval:()=>intervals++,Number};
  vm.runInNewContext(exports.EMBEDDED_PLAYER_BRIDGE,scope);
  return {scope,messages,handlers,intervals:()=>intervals};
}
test('embedded pause/play follows actual video state and leaves ordinary playback controls alone',()=>{
  const media={paused:false,currentTime:20,duration:100,pause(){this.paused=true;},play(){this.paused=false;return Promise.resolve();}};
  const f=page(media);f.scope.window.__pixelTogglePlayback();assert.equal(media.paused,true);
  assert.equal(JSON.parse(f.messages.at(-1)).playing,false);f.scope.window.__pixelTogglePlayback();assert.equal(media.paused,false);
  let prevented=false;f.handlers.click({target:{closest:()=>null},preventDefault:()=>prevented=true,stopPropagation(){}});
  assert.equal(prevented,false);assert.equal(f.scope.window.open(),null);
  vm.runInNewContext(exports.EMBEDDED_PLAYER_BRIDGE,f.scope);assert.equal(f.intervals(),1);
});
test('a provider with no accessible video never advertises a working native pause button',()=>{
  const f=page(null);assert.equal(JSON.parse(f.messages[0]).canControl,false);assert.doesNotThrow(()=>f.scope.window.__pixelTogglePlayback());
});
