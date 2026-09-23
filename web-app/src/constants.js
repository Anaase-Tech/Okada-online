export const VEHICLES = [
  {id:"okada",    label:"Okada",     icon:"🏍️", rate:2.5},
  {id:"car",      label:"Car",       icon:"🚗", rate:4.0},
  {id:"tricycle", label:"Tricycle",  icon:"🛺", rate:3.0},
  {id:"bicycle",  label:"E-Bicycle", icon:"🚴", rate:1.5},
];

export const LOCS = [
  "Akosombo","Atimpoku","Senchi","Frankadua","Adjena","Akrade",
  "Asesewa","Kpong","Odumase-Krobo","Agormanya","Somanya","Nkurakan",
  "Koforidua","Nsawam","Aburi"
];

// Approximate town-center coordinates for Eastern Region Ghana — drives the
// live map pins/routing. Swap for live Places geocoding later if you want
// exact pickup points instead of town centers.
export const LOCATION_COORDS = {
  "Akosombo":      { lat: 6.2966, lng: 0.0568 },
  "Atimpoku":      { lat: 6.2118, lng: 0.1508 },
  "Senchi":        { lat: 6.2167, lng: 0.1667 },
  "Frankadua":     { lat: 6.2833, lng: 0.2333 },
  "Adjena":        { lat: 6.3500, lng: 0.0500 },
  "Akrade":        { lat: 6.1500, lng: 0.1500 },
  "Asesewa":       { lat: 6.3500, lng: -0.0500 },
  "Kpong":         { lat: 6.1333, lng: 0.0667 },
  "Odumase-Krobo": { lat: 6.0972, lng: 0.0464 },
  "Agormanya":     { lat: 6.1084, lng: 0.0296 },
  "Somanya":       { lat: 6.0961, lng: -0.0128 },
  "Nkurakan":      { lat: 6.1667, lng: -0.1167 },
  "Koforidua":     { lat: 6.0940, lng: -0.2591 },
  "Nsawam":        { lat: 5.8072, lng: -0.3505 },
  "Aburi":         { lat: 5.8500, lng: -0.1833 },
};

export const COUNTRIES = [
  "Nigeria","UK","USA","Germany","France","South Africa",
  "Kenya","China","India","Canada","Australia","UAE","Italy","Japan","Other"
];

export const SPLITS = {
  platform: 0.15, owner: 0.50, driver: 0.25, fuel: 0.05, maintenance: 0.05
};
