import test from 'node:test';
import assert from 'node:assert/strict';
import { profilePageRedirect } from '../server/middleware/profilePage.js';
test('browser bookmark of the profile picker opens the SPA shell instead of the legacy API',()=>{
 let redirect,passed=false;
 profilePageRedirect({method:'GET',headers:{accept:'text/html,application/xhtml+xml'},query:{}},{redirect:(status,path)=>{redirect=[status,path];}},()=>{passed=true;});
 assert.deepEqual(redirect,[303,'/']);assert.equal(passed,false);
});
test('JSON, wildcard, authenticated and query-based profile data requests still require the legacy authentication chain',()=>{
 for(const request of [
  {method:'GET',headers:{accept:'application/json'},query:{}},
  {method:'GET',headers:{accept:'*/*'},query:{}},
  {method:'GET',headers:{accept:'text/html'},query:{userId:123}},
  {method:'GET',headers:{accept:'text/html',authorization:'Bearer fixture'},query:{}},
  {method:'POST',headers:{accept:'text/html'},query:{}},
 ]){
  let passed=false;
  profilePageRedirect(request,{redirect(){throw Error('API request redirected');}},()=>{passed=true;});assert.equal(passed,true);
 }
});
