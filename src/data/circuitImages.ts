import hyderabadImg from '../assets/images/circuit_hyderabad_1795671412599.jpg';
import bangaloreImg from '../assets/images/circuit_bangalore_1795688011766.jpg';
import mumbaiImg from '../assets/images/circuit_mumbai_1795671412107.jpg';
import delhiImg from '../assets/images/circuit_delhi_1795687990165.jpg';
import goaImg from '../assets/images/circuit_goa_1795688016906.jpg';
import londonImg from '../assets/images/circuit_london_1795671410930.jpg';
import parisImg from '../assets/images/circuit_paris_1795671411812.jpg';
import newyorkImg from '../assets/images/circuit_newyork_1795687990574.jpg';
import sfImg from '../assets/images/circuit_sanfrancisco_1795671412103.jpg';
import sydneyImg from '../assets/images/circuit_sydney_1795687991989.jpg';
import shanghaiImg from '../assets/images/circuit_shanghai_1795688015338.jpg';
import lasvegasImg from '../assets/images/circuit_lasvegas_1795687988258.jpg';

export const CIRCUIT_IMAGES: Record<string, string> = {
  // India GP (15 cities)
  hyderabad: hyderabadImg,
  bangalore: bangaloreImg,
  mumbai: mumbaiImg,
  kolkata: delhiImg,
  delhi: delhiImg,
  chennai: goaImg,
  pondicherry: goaImg,
  vijayawada: hyderabadImg,
  vizag: goaImg,
  warangal: delhiImg,
  kochi: goaImg,
  goa: goaImg,
  pune: bangaloreImg,
  ahmedabad: hyderabadImg,
  srinagar: delhiImg,

  // World Tour (12 cities)
  london: londonImg,
  paris: parisImg,
  newyork: newyorkImg,
  mexicocity: parisImg,
  sanfrancisco: sfImg,
  dallas: newyorkImg,
  toronto: newyorkImg,
  sydney: sydneyImg,
  shanghai: shanghaiImg,
  hongkong: shanghaiImg,
  bangkok: shanghaiImg,
  lasvegas: lasvegasImg,
};

export function getCircuitImage(circuitId: string): string {
  return CIRCUIT_IMAGES[circuitId] ?? hyderabadImg;
}
