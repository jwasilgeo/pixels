var view,
  analysisLayer;

require([
  'dojo/dom-construct',

  'esri/Map',
  'esri/views/MapView',

  'esri/Graphic',
  'esri/layers/GraphicsLayer',
  'esri/layers/ImageryLayer',
  'esri/layers/support/RasterFunction',
  'esri/layers/support/DimensionalDefinition',
  'esri/layers/support/MosaicRule',

  'esri/request',

  'esri/widgets/LayerList',
  'esri/widgets/Sketch/SketchViewModel',

  'dojo/domReady!'
], function(
  domConstruct,
  Map, MapView,
  Graphic, GraphicsLayer, ImageryLayer, RasterFunction, DimensionalDefinition, MosaicRule,
  esriRequest,
  LayerList, SketchViewModel
) {
    view = new MapView({
      container: 'viewDiv',
      map: new Map({
        basemap: 'dark-gray'
      }),
      zoom: 11,
      center: [-116.35, 33.56],
    });

    view.when(setupViewComponents);

    var visualLayer = new ImageryLayer({
      // url: 'https://landsat.arcgis.com/arcgis/rest/services/Landsat/MS/ImageServer',
      url: 'https://landsat.arcgis.com/arcgis/rest/services/Landsat8_Views/ImageServer',
      title: 'Landsat 8 — natural color',
      format: 'jpgpng',
      renderingRule: new RasterFunction({
        functionName: 'Natural Color with DRA'
      })
    });

    // renderingRule: new RasterFunction({
    //   functionName: 'Resample',
    //   functionArguments: {
    //     ResamplingType: 1,
    //     Raster: new RasterFunction({
    //       functionName: 'Natural Color with DRA',
    //       functionArguments: {
    //         Raster: '$$'
    //       }
    //     })
    //   }
    // })

    // analysisLayer = new ImageryLayer({
    //   // url: 'https://landsat.arcgis.com/arcgis/rest/services/Landsat/MS/ImageServer',
    //   url: 'https://landsat.arcgis.com/arcgis/rest/services/Landsat8_Views/ImageServer',
    //   title: 'Landsat 8 — analysis',
    //   format: 'lerc',
    //   pixelFilter: unmix,
    //   renderingRule: new RasterFunction({
    //     functionName: 'None'
    //   }),
    //   // mosaicRule: new MosaicRule({
    //   //   multidimensionalDefinition: [new DimensionalDefinition({
    //   //     dimensionName: 'StdTime', // time temp was recorded
    //   //     values: [1396828800000], // Week of April 7, 2014
    //   //     isSlice: true
    //   //   })]
    //   // }),
    //   visible: false
    // });

    var drawGraphicsLayer = new GraphicsLayer({
      listMode: 'hide'
    });

    view.map.add(visualLayer);
    // view.map.add(analysisLayer);
    view.map.add(drawGraphicsLayer);

    function setupViewComponents() {
      // place and show the endmembers component's container node
      view.ui.add(document.querySelector('#topbar'), {
        position: 'top-right'
      });
      document.querySelector('#topbar').classList.remove('off');

      // add a LayerList widget
      // view.ui.add(new LayerList({
      //   view: view
      // }), {
      //     position: 'top-right'
      //   }
      // );

      // create a new sketch view model
      var sketchViewModel = new SketchViewModel({
        view: view,
        polygonSymbol: {
          type: 'simple-fill',
          color: 'rgba(138,43,226, 0.2)',
          style: 'solid',
          outline: {
            color: 'white',
            width: 1
          }
        }
      });

      sketchViewModel.on('create-complete', function(evt) {
        var drawnPolygonGraphic = new Graphic({
          geometry: evt.geometry,
          symbol: evt.target.polygonSymbol
        });

        drawGraphicsLayer.add(drawnPolygonGraphic);

        setActiveButton();

        createNewEndmemberNode(drawnPolygonGraphic);
      });

      document.querySelector('#polygonButton').onclick = function() {
        // set the sketch to create a polygon geometry
        sketchViewModel.create('polygon');
        setActiveButton(this);
      };

      document.querySelector('#resetButton').onclick = function() {
        drawGraphicsLayer.removeAll();
        sketchViewModel.reset();
        setActiveButton();
        domConstruct.empty(document.querySelector('#endmember-list'));
      };
    }

    function setActiveButton(selectedButton) {
      // focus the view to activate keyboard shortcuts for sketching
      view.focus();

      document.querySelectorAll('.active').forEach(function(element) {
        element.classList.remove('active');
      });

      if (selectedButton) {
        selectedButton.classList.add('active');
      }
    }

    function createNewEndmemberNode(polygonGraphic) {
      var endmember = domConstruct.create('div', {
        innerHTML: [
          '<hr>',
          '<input type="text" placeholder="name your endmember" />',
          '<div>',
          '  <svg width="260" height="130"></svg>',
          '</div>'
        ].join('')
      }, document.querySelector('#endmember-list'), 'last');

      // store the polygon graphic
      // endmember.dataset.trainingGraphic = JSON.stringify(polygonGraphic.toJSON());

      endmember.dataset.endmemberName = 'temp';

      // store the endmember name when input changes
      endmember.querySelector('input').addEventListener('change', function(evt) {
        endmember.dataset.endmemberName = evt.target.value;
      });

      var lineGraphViz = generateLineGraph(endmember);

      // get and store the sampled pixels within the drawn polygon
      esriRequest(visualLayer.url + '/getSamples', {
        responseType: 'json',
        method: 'post',
        query: {
          f: 'json',
          geometry: JSON.stringify(polygonGraphic.geometry.toJSON()),
          geometryType: 'esriGeometryPolygon '
        }
      }).then(function(response) {
        var tallys = [];
        // var maxBandIndex = visualLayer.bandCount - 1; // minus 1 because we don't want panchromatic at band position 8
        var maxBandIndex = 7; // https://www.esri.com/arcgis-blog/products/product/imagery/band-combinations-for-landsat-8/
        for (var i = 0; i < maxBandIndex; i++) {
          tallys.push(0);
        }

        response.data.samples.forEach(function(sample) {
          // convert from space-separated string
          // to array of numbers
          // and add to tallying object
          sample.value
            .split(' ')
            .map(function(value) {
              return +value;
            })
            .forEach(function(value, bandIndex) {
              if (bandIndex === maxBandIndex) {
                return;
              }
              tallys[bandIndex] += value;
            });
        });

        // convert sums in tally object to averages per each band index
        var averages = tallys.map(function(tally) {
          return tally / response.data.samples.length;
        });

        // store the averages data on the html node
        endmember.dataset.signatures = JSON.stringify(averages);

        // finally generate the svg line graph path
        lineGraphViz.g.append('path')
          .datum(averages)
          .attr('fill', 'none')
          .attr('stroke', 'steelblue')
          .attr('stroke-linejoin', 'round')
          .attr('stroke-linecap', 'round')
          .attr('stroke-width', 1.5)
          .attr('d', lineGraphViz.lineGenerator);
      });
    }

    function generateLineGraph(containerNodeWithSvgChild) {
      var svg = d3.select(containerNodeWithSvgChild).select('svg');

      var margin = {
        top: 20,
        right: 20,
        bottom: 30,
        left: 50
      };

      var width = +svg.attr('width') - margin.left - margin.right;

      var height = +svg.attr('height') - margin.top - margin.bottom;

      var g = svg.append('g')
        .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

      var xAxis = d3.scalePoint()
        .range([0, width])
        .domain(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7']);

      var yAxis = d3.scaleLinear()
        .rangeRound([height, 0])
        .domain([0, 100]);

      var scaledApparentReflectanceConversion = d3.scaleLinear()
        .range([0, 100])
        // TODO: assign landsat service min/max values to this domain (used to be 5000, 55000)
        .domain([0, 10000]);

      var lineGenerator = d3.line()
        .curve(d3.curveMonotoneX)
        .x(function(d, idx) {
          var bandValue = 'B' + (idx + 1);
          return xAxis(bandValue);
        })
        .y(function(d) {
          d = scaledApparentReflectanceConversion(d);
          return yAxis(d);
        });

      g.append('g')
        .attr('transform', 'translate(0,' + height + ')')
        .call(d3.axisBottom(xAxis))
        .select('.domain')
        .remove();

      g.append('g')
        .call(d3.axisLeft(yAxis)
          .tickValues([yAxis.domain()[0], d3.mean(yAxis.domain()), yAxis.domain()[1]]))
        .select('.domain')
        .remove();

      return {
        svg: svg,
        g: g,
        lineGenerator: lineGenerator
      };
    }

    function unmix(pixelData) {
      if (pixelData === null || pixelData.pixelBlock === null ||
        pixelData.pixelBlock.pixels === null) {
        return;
      }

      // var endmemberSignatureInfo = {};
      var signatures = [];
      document.querySelectorAll('#endmember-list div').forEach(function(element) {
        var arrayFromJson = JSON.parse(element.dataset.signatures);
        // endmemberSignatureInfo[element.dataset.endmemberName] = new Matrix([arrayFromJson]);
        signatures.push(arrayFromJson);
      });

      // convert input endmember signature means into arrays of each endmember across bands
      // [[vegB, vegG, vegR, ...], [shadowB, shadowG, shadowR, ...], [...]]

      // and then transpose signature axes into arrays of each band's endmembers
      // [[vegB, shadowB, npvB, ...], [vegG, shadowG, npvG, ...], [...]]

      // matrix of shape [7, nEndmemberSignatureMeans]
      var coefficients = new Matrix(signatures).T;

      // no need for panchromatic band at band position 8
      // matrix of shape [7, pixelObservations]
      var pixelMatrix = new Matrix(pixelData.pixelBlock.pixels.slice(0, 7));

      // transpose raster array axes into arrays of band values per pixel,
      // [B, G, R, NIR1, SWIR1, SWIR2] at each pixel
      // inBlockT = inBlock.transpose([1, 2, 0])

      // reshape to slightly flatten to 2d array,
      // and pixel stacks to solve must be transposed to(M, K) matrix of K columns
      // y = inBlockT.reshape(-1, inBlockT.shape[-1]).T

      debugger;

      // pixelMatrix.solve(endmemberMatrixStuff...)

      // Set the new pixel values on the pixelBlock
      // pixelData.pixelBlock.pixels = pixelData.pixelBlock.pixels.slice(1, 4);
      // pixelData.pixelBlock.pixels = [rBand, gBand, bBand];
      // pixelData.pixelBlock.pixelType = 'U8'; // U8 is used for color
      // pixelData.pixelBlock.pixelType = 'F4'; // F4 was used in PRF

      return;



      // Create some representative endmembers computed previously by sampling
      // the Landsat 5 mosaic.
      var urbanEndmember = [88, 42, 48, 38, 86, 115, 59];
      var vegEndmember = [50, 21, 20, 35, 50, 110, 23];
      var waterEndmember = [51, 20, 14, 9, 7, 116, 4];

      // Compute the 3x7 pseudo inverse.
      var endmembers = ee.Array([urbanEndmember, vegEndmember, waterEndmember]);
      var inverse = ee.Image(endmembers.matrixPseudoInverse().transpose());

      // Convert the bands to a 2D 7x1 array. The toArray() call concatenates
      // pixels from each band along the default axis 0 into a 1D vector per
      // pixel, and the toArray(1) call concatenates each band (in this case
      // just the one band of 1D vectors) along axis 1, forming a 2D array.
      var inputValues = allBandMosaic.toArray().toArray(1);

      // Matrix multiply the pseudo inverse of the endmembers by the pixels to
      // get a 3x1 set of endmembers fractions from 0 to 1.
      var unmixed = inverse.matrixMultiply(inputValues);

      // Create and show a colored image of the endmember fractions. Since we know
      // the result has size 3x1, project down to 1D vectors at each pixel (since the
      // second axis is pointless now), and then flatten back to a regular scalar
      // image.
      var colored = unmixed
        .arrayProject([0])
        .arrayFlatten([['urban', 'veg', 'water']]);




      // The pixelBlock stores the values of all pixels visible in the view
      var pixelBlock = pixelData.pixelBlock;

      // Get the min and max values of the data in the current view
      var minValue = pixelBlock.statistics[0].minValue;
      var maxValue = pixelBlock.statistics[0].maxValue;

      // The pixels visible in the view
      var pixels = pixelBlock.pixels;

      // The number of pixels in the pixelBlock
      var numPixels = pixelBlock.width * pixelBlock.height;

      // Calculate the factor by which to determine the red and blue
      // values in the unmixd version of the layer
      var factor = 255.0 / (maxValue - minValue);

      // Get the pixels containing temperature values in the only band of the data
      var tempBand = pixels[0];

      // Create empty arrays for each of the RGB bands to set on the pixelBlock
      var rBand = [];
      var gBand = [];
      var bBand = [];

      // Loop through all the pixels in the view
      var i;
      for (i = 0; i < numPixels; i++) {
        // Get the pixel value (the temperature) recorded at the pixel location
        var tempValue = tempBand[i];
        // Calculate the red value based on the factor
        var red = (tempValue - minValue) * factor;

        // Sets a color between blue (coldest) and red (warmest) in each band
        rBand[i] = red;
        gBand[i] = 0;
        bBand[i] = 255 - red;
      }

      // Set the new pixel values on the pixelBlock
      pixelData.pixelBlock.pixels = [rBand, gBand, bBand];
      pixelData.pixelBlock.pixelType = 'U8'; // U8 is used for color
    }

  });
