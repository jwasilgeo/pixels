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
      functionName: 'None',
      // functionName: 'ExtractBand',
      // functionArguments: {
      //   'BandIDs': [3, 4]
      // }
    });

    function ndviPixelFilter(pixelData) {
      if (
        pixelData === null ||
        pixelData.pixelBlock === null ||
        pixelData.pixelBlock.pixels === null
      ) {
        return;
      }

      console.time('ndvi: for loop');

      var start = window.performance.now();

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

        ndvi8Bit = (ndviRaw - -1) * (255 - 0) / (1 - -1) + 0;

        ndviBand[i] = ndvi8Bit;
      }

      pixelData.pixelBlock.pixels = [ndviBand];
      pixelData.pixelBlock.pixelType = 'U8'; // U8 is used for 8bit RGBA color display

      console.timeEnd('ndvi: for loop');

      var end = window.performance.now();
      var time = end - start;

      console.log(time);
    }

    layer = new ImageryLayer({
      url: 'https://landsat.arcgis.com/arcgis/rest/services/Landsat8_Views/ImageServer',
      renderingRule: rf,
      pixelFilter: ndviPixelFilter,

      // for lerc format we must cut down on network request size (~9MB down to ~3MB lerc)
      // TODO: how does this compare to "ExtractBands" raster server function?
      bandIds: [3, 4], // RED band 4 and NIR band 5

      // TODO: smaller network requests with format 'png' (~3MB lerc vs ~1.5MB png)
      // but visually the results are a bit different
      format: 'lerc'
    });

    map.add(layer);

  });

// function convertRange(value, inRange, outRange) {
//   return (value - inRange[0]) * (outRange[1] - outRange[0]) / (inRange[1] - inRange[0]) + outRange[0];
// }

// convertRange(328.17, [-1, 1], [0, 255]);
