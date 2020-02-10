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

    function ndviPixelFilter(pixelData) {
      if (pixelData === null || pixelData.pixelBlock === null ||
        pixelData.pixelBlock.pixels === null) {
        return;
      }

      console.time('ndvi: vectorious js');

      // NIR band 5
      var nirBand = pixelData.pixelBlock.pixels[1];
      // RED band 4
      var redBand = pixelData.pixelBlock.pixels[0];

      var nirMatrix = new Matrix([nirBand]);
      var redMatrix = new Matrix([redBand]);

      var ndviPixels = Matrix
        .binOp(nirMatrix, redMatrix, function(nirValue, redValue) {
          return (nirValue - redValue) / (nirValue + redValue);
        })
        .map(function(value) {
          // convert from -1 to 1 range to 8bit 0 to 255
          return (value - -1) * (255 - 0) / (1 - -1) + 0;
        })
        .toArray();

      console.timeEnd('ndvi: vectorious js');

      // Set the new pixel values on the pixelBlock
      pixelData.pixelBlock.pixels = ndviPixels;
      pixelData.pixelBlock.pixelType = 'U8'; // U8 is used for 8bit RGBA color display
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
