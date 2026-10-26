import { expect, it, vi } from 'vitest';
import { MapScene } from '@/components/custom/map-scene';

it('does not paint a temporarily hidden or undersized debate canvas',()=>{
  vi.stubGlobal('Image',class {src='';decoding='';});
  const setTransform=vi.fn();
  const canvas={getContext:()=>({setTransform}),addEventListener:vi.fn(),style:{},width:0,height:0} as unknown as HTMLCanvasElement;
  try{
    const scene=new MapScene(canvas);
    for(const [w,h] of [[0,300],[20,300],[300,10]])expect(()=>scene.resize(w,h)).not.toThrow();
    expect(setTransform).not.toHaveBeenCalled();
  }finally{vi.unstubAllGlobals();}
});
