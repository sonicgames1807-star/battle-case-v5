let context;
export function playSound(name='click'){
  try{
    if(localStorage.getItem('ccl-sound')==='off')return;
    context??=new(window.AudioContext||window.webkitAudioContext)();
    if(context.state==='suspended')context.resume();
    const now=context.currentTime;
    const tones={click:[[520,.045,'square',.035]],spin:[[540,.11,'sawtooth',.045],[760,.22,'sawtooth',.035],[980,.34,'triangle',.025]],reveal:[[440,.08,'triangle',.06],[660,.12,'triangle',.055],[880,.24,'sine',.05]],win:[[523,.09,'triangle',.06],[659,.11,'triangle',.06],[784,.16,'sine',.06],[1046,.28,'sine',.05]],fail:[[320,.14,'triangle',.05],[220,.3,'sawtooth',.035]],rocket:[[140,.18,'sawtooth',.05],[260,.26,'sawtooth',.035]],crash:[[110,.3,'sawtooth',.07],[65,.45,'square',.035]],step:[[390,.07,'triangle',.045],[520,.1,'sine',.035]],crane:[[180,.13,'square',.04],[320,.12,'triangle',.05],[640,.2,'sine',.04]]};
    (tones[name]||tones.click).forEach(([frequency,duration,wave,volume],index)=>{
      const oscillator=context.createOscillator(),gain=context.createGain(),start=now+index*.075;
      oscillator.type=wave;oscillator.frequency.setValueAtTime(frequency,start);if(name==='spin')oscillator.frequency.exponentialRampToValueAtTime(Math.max(120,frequency*.48),start+duration);
      gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(volume,start+.012);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
      oscillator.connect(gain).connect(context.destination);oscillator.start(start);oscillator.stop(start+duration+.02);
    });
  }catch{}
}
