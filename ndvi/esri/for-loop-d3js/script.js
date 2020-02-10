var layer, view;
require([
  'esri/Map',
  'esri/views/MapView',
  'esri/layers/ImageryLayer',
  'esri/layers/support/RasterFunction'
], function(
  Map,
  MapView,
  ImageryLayer,
  RasterFunction
) {
    var map = new Map({
      basemap: 'dark-gray-vector'
    });

    view = new MapView({
      container: 'viewDiv',
      map: map,
      zoom: 4,
      center: [-90, 38],
    });

    // Set the rendering rule to the 'None' raster function.
    // This will allow us to gain access to the raw values assigned to each pixel.
    var rf = new RasterFunction({
      functionName: 'None'
    });

    // d3js: test case 1
    // var ndviToBlackWhiteScale = d3.scaleLinear()
    //   .domain([-1, 1])
    //   .range(['black', 'white']);
    // var blackWhiteNdviPixel = function(ndviRawValue) {
    //   // returns an 8bit value appropriate for RGB display between 0-255
    //   return d3.color(ndviToBlackWhiteScale(ndviRawValue)).r;
    // };

    // d3js: test case 2
    var ndviTo8bitScale = d3.scaleLinear()
      .domain([-1, 1])
      .range([0, 255]);

    function ndviPixelFilter(pixelData) {
      if (
        pixelData === null ||
        pixelData.pixelBlock === null ||
        pixelData.pixelBlock.pixels === null
      ) {
        return;
      }

      console.time('ndvi: for loop with d3js');

      // NIR band 5
      var nirBand = pixelData.pixelBlock.pixels[1];
      // RED band 4
      var redBand = pixelData.pixelBlock.pixels[0];

      var numPixels = pixelData.pixelBlock.width * pixelData.pixelBlock.height;

      // Create empty arrays for each of the RGB bands to set on the pixelBlock
      // We only need 1, however, since we are displaying only in grayscale
      var ndviBand = [];

      // Loop through all the pixels in the view
      var i,
        ndviRaw,
        ndvi8Bit;

      for (i = 0; i < numPixels; i++) {
        ndviRaw = (nirBand[i] - redBand[i]) / (nirBand[i] + redBand[i]);

        // ndvi8Bit = blackWhiteNdviPixel(ndviRaw);
        ndvi8Bit = ndviTo8bitScale(ndviRaw);

        ndviBand[i] = ndvi8Bit;
      }

      pixelData.pixelBlock.pixels = [ndviBand];
      pixelData.pixelBlock.pixelType = 'U8'; // U8 is used for 8bit RGBA color display

      console.timeEnd('ndvi: for loop with d3js');
    }

    layer = new ImageryLayer({
      url: 'https://landsat.arcgis.com/arcgis/rest/services/Landsat8_Views/ImageServer',
      renderingRule: rf,
      pixelFilter: ndviPixelFilter,
      bandIds: [3, 4]
    });

    map.add(layer);

  });

// function convertRange(value, inRange, outRange) {
//   return (value - inRange[0]) * (outRange[1] - outRange[0]) / (inRange[1] - inRange[0]) + outRange[0];
// }

// convertRange(328.17, [-1, 1], [0, 255]);
