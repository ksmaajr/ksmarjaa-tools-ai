import {describe,it,expect}from'vitest';
import {publish,getActivity,clearActivity,redact}from'./activity';
describe('local activity history',()=>{
  it('redacts known API secret formats and bearer headers',()=>{expect(redact('key rms_live_secret123 Bearer abc123 sk-testsecret')).not.toContain('secret123');expect(redact('Bearer abc123')).not.toContain('abc123');expect(redact('sk-testsecret')).not.toContain('testsecret');});
  it('retains a bounded newest-first history and clears it',()=>{clearActivity();for(let i=0;i<2005;i++)publish({level:'info',category:'app',message:'Event '+i,notify:false});const entries=getActivity();expect(entries).toHaveLength(2000);expect(entries[0].message).toBe('Event 2004');expect(entries[1999].message).toBe('Event 5');entries[0].message='changed';expect(getActivity()[0].message).toBe('Event 2004');clearActivity();expect(getActivity()).toEqual([]);});
});
