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

      console.time('ndvi: tensor flow js');

      // NIR band 5
      var nirBand = pixelData.pixelBlock.pixels[1];
      // RED band 4
      var redBand = pixelData.pixelBlock.pixels[0];

      var nirTensor = new tf.tensor1d(nirBand);
      var redTensor = new tf.tensor1d(redBand);


      var ndviTensor = tf
        .div(
          tf.sub(nirTensor, redTensor),
          tf.add(nirTensor, redTensor)
        );

      // tensor flow garbage collection
      nirTensor.dispose();
      redTensor.dispose();

      var ndvi8BitTensor = tf
        .mul(
          tf.sub(ndviTensor, tf.scalar(-1)),
          tf.sub(tf.scalar(255), tf.scalar(0))
        )
        .div(
          tf.sub(tf.scalar(1), tf.scalar(-1))
        )
        .add(
          tf.scalar(0)
        );

      // tensor flow garbage collection
      ndviTensor.dispose();

      // convert tensor to array of pixel values for the imagery layer
      pixelData.pixelBlock.pixels = [ndvi8BitTensor.dataSync()];
      pixelData.pixelBlock.pixelType = 'U8'; // U8 is used for 8bit RGBA color display

      // tensor flow garbage collection
      ndvi8BitTensor.dispose();

      console.timeEnd('ndvi: tensor flow js');
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
