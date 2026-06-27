// Body-map click targets, traced from the council's official paper body-map
// chart (front.png / back.png) so clinicians see the same diagram they're
// used to on the printed form.
import frontImg from '../assets/bodymap/front.png';
import backImg from '../assets/bodymap/back.png';

export function FrontBodySvg() {
  return <img src={frontImg} alt="Front of body" className="w-full h-full object-contain select-none" draggable={false} />;
}

export function BackBodySvg() {
  return <img src={backImg} alt="Back of body" className="w-full h-full object-contain select-none" draggable={false} />;
}
