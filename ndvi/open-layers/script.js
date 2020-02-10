import 'ol/ol.css';
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import ImageLayer from 'ol/layer/Image';
import ImageArcGISRest from 'ol/source/ImageArcGISRest';
import RasterSource from 'ol/source/Raster.js';

var landsat = new ImageArcGISRest({
  url: 'https://landsat.arcgis.com/arcgis/rest/services/Landsat8_Views/ImageServer',
  crossOrigin: 'anonymous',
  ratio: 1,
  params: {
    FORMAT: 'jpgpng',
    renderingRule: JSON.stringify({
      'rasterFunction': 'Natural Color with DRA'
    })
  }
});

var landsatBand5 = new ImageArcGISRest({
  url: 'https://landsat.arcgis.com/arcgis/rest/services/Landsat8_Views/ImageServer',
  crossOrigin: 'anonymous',
  ratio: 1,
  params: {
    FORMAT: 'jpgpng',
    renderingRule: JSON.stringify({
      // 'rasterFunction': 'None'
      'rasterFunction': 'ExtractBand',
      'rasterFunctionArguments': {
        'BandIDs': [4]
      }
    }),
    // bandIds: [4]
  }
});

var landsatBand4 = new ImageArcGISRest({
  url: 'https://landsat.arcgis.com/arcgis/rest/services/Landsat8_Views/ImageServer',
  crossOrigin: 'anonymous',
  ratio: 1,
  params: {
    FORMAT: 'jpgpng',
    renderingRule: JSON.stringify({
      // 'rasterFunction': 'None'
      'rasterFunction': 'ExtractBand',
      'rasterFunctionArguments': {
        'BandIDs': [3]
      }
    }),
    // bandIds: [3]
  }
});

/**
 * Create a raster source where NDVI will be calculated from pixels from 2 separate Landsat bands.
 */
var raster = new RasterSource({
  sources: [landsatBand4, landsatBand5],
  /**
   * Run calculations on pixel data.
   * @param {Array} pixels List of pixels (one per source).
   * @param {Object} data User data object.
   * @return {Array} The output pixel.
   */
  operation: function(pixels, data) {
    // (b5 - b4) / (b5 + b4)

    var ndviRaw = (pixels[1][0] - pixels[0][0]) / (pixels[1][0] + pixels[0][0]);
    ndviRaw = ndviRaw || -1;

    var ndvi8Bit = (ndviRaw - -1) * (255 - 0) / (1 - -1) + 0;

    return [ndvi8Bit, ndvi8Bit, ndvi8Bit, 255];
  },

  // optional functions that will be made available to worker threads
  // lib: {},

  // operationType: 'image',
  operationType: 'pixel',

  // set to 0 to do operation without worker threads
  threads: 0
});

// function createCounts(min, max, num) {
//   var values = new Array(num);
//   for (var i = 0; i < num; ++i) {
//     values[i] = 0;
//   }
//   return {
//     min: min,
//     max: max,
//     values: values,
//     delta: (max - min) / num
//   };
// }

raster.on('beforeoperations', function(event) {
  // console.log('beforeoperations', event);
  console.time('operation');
  
});

raster.on('afteroperations', function(event) {
  // console.log('afteroperations', event);
  console.timeEnd('operation');
});

var map = new Map({
  layers: [
    // new ImageLayer({
    //   source: landsat
    // }),
    new ImageLayer({
      source: raster
    })
  ],
  target: 'map',
  view: new View({
    center: [-9651695, 4937351],
    zoom: 6,
    // minZoom: 1,
    // maxZoom: 19
  })
});
