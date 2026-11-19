/* Music is an authored app layer, not world state. The scene id is the only
   input it accepts; portals and rebuilds remain owned by Scene/FrostwoodWorld. */
export const MUSIC_TRACKS=Object.freeze({
  frostwood:Object.freeze({asset:'veil',title:'Veil of Dreams'}),
  /* BORROWED. The meadow's piece, Sunny Stroll, is a paid track with no
     redistribution grant, so the repository does not carry it. assets/music/
     CREDITS.md lists the licence of each file that ships. */
  meadow:Object.freeze({asset:'veil',title:'Veil of Dreams',placeholder:true}),
  swamp:Object.freeze({asset:'lily',title:'Lily — Paddling Down the Stream'}),
  /* BORROWED, AND SAID SO IN THE DATA RATHER THAN IN A COMMENT. Every other
     world has a piece written for it and this one does not yet, so it plays
     Frostwood's. `placeholder` is what makes the gap executable: test/music.test.mjs
     asserts that at most one scene carries it, so a second borrowed track fails
     rather than quietly shipping two worlds that sound the same. The title
     stays truthful, because it is the track that is actually playing. */
  desert:Object.freeze({asset:'veil',title:'Veil of Dreams',placeholder:true}),
  /* BORROWED too: the Hollow lies under the Frostwood and plays its piece
     until it has one. test/music.test.mjs names both borrowers. */
  hollow:Object.freeze({asset:'veil',title:'Veil of Dreams',placeholder:true}),
});

export const FIRST_FADE_S=4;
export const CROSSFADE_S=3;
export const STOP_FADE_S=0.8;
export const MUSIC_VOLUME=Object.freeze({min:0,max:1,step:0.05,default:0.30});

export function musicTrackForScene(sceneId){
  return MUSIC_TRACKS[sceneId]||null;
}

export function travellerMoved(x0,y0,x1,y1){
  const dx=x1-x0,dy=y1-y0;
  return dx*dx+dy*dy>1e-8;
}

function hold(param,at){
  if(param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(at);
  else{
    const value=param.value;
    param.cancelScheduledValues(at);
    param.setValueAtTime(value,at);
  }
}

export class BiomeMusic{
  constructor(assets,{contextFactory}={}){
    const AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext;
    this.assets=assets;
    this.contextFactory=contextFactory||(AudioContext?()=>new AudioContext():null);
    this.available=!!this.contextFactory;
    this.error=null;
    this.ctx=null;
    this.mix=null;
    this.master=null;
    this.analyser=null;
    this.spectrum=null;
    this.buffers=new Map();
    this.ready=null;
    this.voices=new Set();
    this.voice=null;
    this.sceneId='frostwood';
    this.movementStarted=false;
    this.userActivated=false;
    this.enabled=true;
    this.volume=MUSIC_VOLUME.default;
    this.disposed=false;
    this.changeToken=0;
  }

  get track(){ return musicTrackForScene(this.sceneId); }
  get title(){ return this.track?.title||'Music'; }
  get playing(){ return !!this.voice&&this.enabled&&this.movementStarted; }

  ensureContext(){
    if(this.ctx||!this.available||this.disposed) return this.ctx;
    try{
      const ctx=this.contextFactory();
      const mix=ctx.createGain(),master=ctx.createGain(),analyser=ctx.createAnalyser();
      analyser.fftSize=64;
      analyser.smoothingTimeConstant=0.82;
      mix.connect(master); master.connect(analyser); analyser.connect(ctx.destination);
      mix.gain.value=1; master.gain.value=this.volume;
      this.ctx=ctx; this.mix=mix; this.master=master; this.analyser=analyser;
      this.spectrum=new Uint8Array(analyser.frequencyBinCount);
    }catch(error){
      this.available=false;
      this.error=error;
    }
    return this.ctx;
  }

  prepare(){
    if(this.ready) return this.ready;
    const ctx=this.ensureContext();
    if(!ctx) return Promise.resolve(false);
    this.ready=(async()=>{
      const assets=new Set(Object.values(MUSIC_TRACKS).map((track)=>track.asset));
      await Promise.all([...assets].map(async(asset)=>{
        const url=this.assets[asset];
        if(!url) throw new Error(`missing music asset '${asset}'`);
        const response=await fetch(url);
        if(!response.ok) throw new Error(`could not load music asset '${asset}'`);
        const buffer=await ctx.decodeAudioData(await response.arrayBuffer());
        this.buffers.set(asset,buffer);
      }));
      return true;
    })().catch((error)=>{
      this.available=false;
      this.error=error;
      return false;
    });
    return this.ready;
  }

  unlock(){
    this.userActivated=true;
    const ctx=this.ensureContext();
    this.prepare();
    if(ctx?.state==='suspended') return ctx.resume().catch((error)=>{ this.error=error; });
    return Promise.resolve();
  }

  syncScene(sceneId){
    if(!musicTrackForScene(sceneId)||sceneId===this.sceneId) return;
    this.sceneId=sceneId;
    if(this.movementStarted&&this.enabled) void this.switchTo(sceneId,CROSSFADE_S);
  }

  begin(sceneId=this.sceneId){
    this.syncScene(sceneId);
    if(this.movementStarted) return;
    this.movementStarted=true;
    if(this.enabled) void this.switchTo(this.sceneId,FIRST_FADE_S);
  }

  async switchTo(sceneId,fade){
    const track=musicTrackForScene(sceneId);
    if(!track||!this.enabled||!this.movementStarted||this.disposed) return;
    if(this.voice?.sceneId===sceneId) return;
    const token=++this.changeToken;
    if(!await this.prepare()) return;
    if(token!==this.changeToken||sceneId!==this.sceneId||
       !this.enabled||!this.movementStarted||this.disposed) return;

    const ctx=this.ctx,now=ctx.currentTime;
    if(this.userActivated&&ctx.state==='suspended') void ctx.resume();
    const source=ctx.createBufferSource(),gain=ctx.createGain();
    source.buffer=this.buffers.get(track.asset);
    source.loop=true;
    source.connect(gain); gain.connect(this.mix);
    gain.gain.setValueAtTime(0,now);
    gain.gain.linearRampToValueAtTime(1,now+fade);
    const voice={source,gain,sceneId};
    this.voices.add(voice);
    source.onended=()=>{
      this.voices.delete(voice);
      try{ source.disconnect(); gain.disconnect(); }catch{}
    };
    source.start(now);

    const old=this.voice;
    this.voice=voice;
    if(old) this.fadeVoice(old,fade,now);
  }

  fadeVoice(voice,fade,now=this.ctx.currentTime){
    if(!voice||voice.stopping) return;
    voice.stopping=true;
    hold(voice.gain.gain,now);
    voice.gain.gain.linearRampToValueAtTime(0,now+fade);
    try{ voice.source.stop(now+fade+0.04); }catch{}
  }

  setVolume(volume){
    this.volume=Math.max(MUSIC_VOLUME.min,Math.min(MUSIC_VOLUME.max,+volume||0));
    if(!this.master||!this.enabled) return this.volume;
    const now=this.ctx.currentTime;
    hold(this.master.gain,now);
    this.master.gain.linearRampToValueAtTime(this.volume,now+0.08);
    return this.volume;
  }

  setEnabled(enabled){
    enabled=!!enabled;
    if(enabled===this.enabled) return;
    this.enabled=enabled;
    ++this.changeToken;
    const ctx=this.ctx;
    if(!enabled){
      if(!ctx) return;
      const now=ctx.currentTime;
      hold(this.master.gain,now);
      this.master.gain.linearRampToValueAtTime(0,now+STOP_FADE_S);
      for(const voice of this.voices){
        voice.stopping=true;
        try{ voice.source.stop(now+STOP_FADE_S+0.04); }catch{}
      }
      this.voice=null;
      return;
    }

    this.stopVoicesNow();
    if(ctx){
      const now=ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.volume,now);
    }
    if(this.movementStarted) void this.switchTo(this.sceneId,FIRST_FADE_S);
  }

  toggle(){
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  stopVoicesNow(){
    for(const voice of this.voices){
      try{ voice.source.stop(); }catch{}
    }
    this.voices.clear();
    this.voice=null;
  }

  sampleLevels(out){
    out.fill(0);
    if(!this.playing||!this.analyser||this.ctx?.state!=='running') return out;
    this.analyser.getByteFrequencyData(this.spectrum);
    const usable=Math.max(out.length,this.spectrum.length-2);
    for(let i=0;i<out.length;i++){
      const a=1+Math.floor(i*usable/out.length);
      const b=Math.min(this.spectrum.length,1+Math.floor((i+1)*usable/out.length));
      let peak=0;
      for(let j=a;j<b;j++) peak=Math.max(peak,this.spectrum[j]);
      out[i]=Math.pow(peak/255,0.72);
    }
    return out;
  }

  setHidden(hidden){
    const ctx=this.ctx;
    if(!ctx||this.disposed) return;
    if(hidden&&ctx.state==='running') void ctx.suspend();
    else if(!hidden&&this.userActivated&&ctx.state==='suspended') void ctx.resume();
  }

  dispose(){
    if(this.disposed) return;
    this.disposed=true;
    ++this.changeToken;
    this.stopVoicesNow();
    try{ this.mix?.disconnect(); this.master?.disconnect(); this.analyser?.disconnect(); }catch{}
    if(this.ctx&&this.ctx.state!=='closed') void this.ctx.close();
  }
}
