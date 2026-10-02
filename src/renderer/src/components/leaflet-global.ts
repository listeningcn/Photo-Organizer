import L from 'leaflet';

// leaflet.markercluster's UMD build extends the global `L`, so it must exist before that plugin is imported.
window.L = L;

export default L;
