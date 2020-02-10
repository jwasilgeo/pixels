var layer, view;
require([
  'esri/Map',
  'esri/views/MapView',
  'esri/layers/ImageryLayer',
  'esri/layers/support/RasterFunction'
], function (
  Map,
  MapView,
  ImageryLayer,
  RasterFunction
) {
  view = new MapView({
    container: 'viewDiv',
    map: new Map({
      basemap: 'dark-gray-vector'
    }),
    zoom: 7,
    center: [-122.5, 46.5]
  });

  // Set the rendering rule to the 'None' raster function.
  // This will allow us to gain access to the raw values assigned to each pixel.
  var rasterFunctionNone = new RasterFunction({
    functionName: 'None',
    // functionName: 'ExtractBand',
    // functionArguments: {
    //   'BandIDs': [0, 7, 14]
    // }
  });

  function createExtractAndStretchRasterFunction(bandsRGB) {
    // https://developers.arcgis.com/documentation/common-data-types/raster-function-objects.htm#ESRI_SECTION1_7545363F0B8A4B7B931A54B3C4189D9D
    return new RasterFunction({
      functionName: 'Stretch',
      functionArguments: {
        StretchType: 3,
        DRA: true,
        // https://developers.arcgis.com/documentation/common-data-types/raster-function-objects.htm#ESRI_SECTION1_2FC6FEAA2801446B9578A7C90B1DD6AB
        Raster: new RasterFunction({
          functionName: 'ExtractBand',
          functionArguments: {
            bandIds: bandsRGB
          }
        })
      }
    });
  }

  var pixelDataCurrent;
  function pixelFilter(pixelData) {
    if (
      pixelData === null ||
      pixelData.pixelBlock === null ||
      pixelData.pixelBlock.pixels === null
    ) {
      pixelDataCurrent = null;
      return;
    }

    pixelDataCurrent = pixelData;

    var rgbaUint8ClampedArray = pixelData.pixelBlock.getAsRGBA();

    var bandX = [];
    var bandY = [];
    var bandZ = [];
    var colors = [];
    for (var index = 0; index < rgbaUint8ClampedArray.length; index += 4) {
      var r = rgbaUint8ClampedArray[index];
      var g = rgbaUint8ClampedArray[index + 1];
      var b = rgbaUint8ClampedArray[index + 2];
      // var a = rgbaUint8ClampedArray[index + 3];

      // if (r === 0 && g === 0 && b === 0) {
      //   // bandX0.push(r);
      //   // bandY0.push(g);
      //   // bandZ0.push(b);
      //   bandX.push(r);
      //   bandY.push(g);
      //   bandZ.push(b);
      //   colors.push('rgb(' + r + ',' + g + ',' + b + ')');
      // } else {
      //   bandX.push(r);
      //   bandY.push(g);
      //   bandZ.push(b);
      //   colors.push('rgb(' + r + ',' + g + ',' + b + ')');
      // }

      bandX.push(r);
      bandY.push(g);
      bandZ.push(b);
      colors.push('rgb(' + r + ',' + g + ',' + b + ')');
    }

    updateChart(chartType, bandX, bandY, bandZ, colors);
  }

  function updateChart(chartType, bandX, bandY, bandZ, colors) {
    var chartInfo = getChartDataAndLayout(chartType, bandX, bandY, bandZ, colors);

    Plotly.react(
      'chartDiv',
      chartInfo.data,
      chartInfo.layout,
      {
        responsive: true,
        displayModeBar: true
      }
    );
  }

  function getChartDataAndLayout(chartType, bandX, bandY, bandZ, colors) {
    // handle histograms chart type separately from 3D chart types
    if (chartType === 'histogram') {
      var data = [
        {
          x: bandX,
          type: 'histogram',
          name: 'Red (' + redBandSelectNode.options[redBandSelectNode.selectedIndex].text + ')',
          opacity: 0.666,
          marker: {
            color: 'red',
          }
        },
        {
          x: bandY,
          type: 'histogram',
          name: 'Green (' + greenBandSelectNode.options[greenBandSelectNode.selectedIndex].text + ')',
          opacity: 0.666,
          marker: {
            color: 'green',
          }
        },
        {
          x: bandZ,
          type: 'histogram',
          name: 'Blue (' + blueBandSelectNode.options[blueBandSelectNode.selectedIndex].text + ')',
          opacity: 0.666,
          marker: {
            color: 'blue',
          }
        }
      ];

      var layout = {
        barmode: 'overlay',
        margin: {
          t: 30,
          r: 40,
          b: 30,
          l: 40
        },
        legend: {
          xanchor: 'right',
          x: 1,
          y: 1,
          bgcolor: 'rgba(0, 0, 0, 0)'
        },
        font: {
          family: '"Avenir Next W01", "Avenir Next W00", "Avenir Next", "Avenir", "Helvetica Neue", sans-serif'
        },
        hoverlabel: {
          font: {
            family: '"Avenir Next W01", "Avenir Next W00", "Avenir Next", "Avenir", "Helvetica Neue", sans-serif'
          }
        }
      };

      return {
        data: data,
        layout: layout
      };
    }

    // handle 3D chart types separately from histograms chart type
    var data = [{
      x: bandX,
      y: bandY,
      z: bandZ,
      hovertemplate:
        [
          'Red (Band ' + redBandSelectNode.value + '): %{x}',
          'Green (Band ' + greenBandSelectNode.value + '): %{y}',
          'Blue (Band ' + blueBandSelectNode.value + '): %{z}',
          '<extra></extra>' // hide the secondary "trace 0" box
        ].join('<br>'),
    }];

    if (chartType === 'scatter3d') {
      data[0].type = 'scatter3d';
      data[0].mode = 'markers';
      data[0].marker = {
        symbol: 'circle',
        color: colors,
        size: 3
      };
    } else if (chartType === 'mesh3d-delaunay') {
      data[0].type = 'mesh3d';
      data[0].alphahull = -1; // Delaunay triangulation
      data[0].vertexcolor = colors;
    } else if (chartType === 'mesh3d-convex') {
      data[0].type = 'mesh3d';
      data[0].alphahull = 0; // convex-hull
      data[0].vertexcolor = colors;
    }

    var layout = {
      margin: {
        t: 10,
        r: 10,
        b: 10,
        l: 10,
      },
      scene: {
        aspectmode: 'cube',
        camera: {
          eye: {
            x: -1.5,
            y: 1.5,
            z: 1.5
          },
        },
        xaxis: {
          title: 'Red (' + redBandSelectNode.options[redBandSelectNode.selectedIndex].text + ')',
          range: [0, 255]
        },
        yaxis: {
          title: 'Green (' + greenBandSelectNode.options[greenBandSelectNode.selectedIndex].text + ')',
          range: [255, 0]
        },
        zaxis: {
          title: 'Blue (' + blueBandSelectNode.options[blueBandSelectNode.selectedIndex].text + ')',
          range: [0, 255]
        }
      },
      font: {
        family: '"Avenir Next W01", "Avenir Next W00", "Avenir Next", "Avenir", "Helvetica Neue", sans-serif'
      },
      hoverlabel: {
        font: {
          family: '"Avenir Next W01", "Avenir Next W00", "Avenir Next", "Avenir", "Helvetica Neue", sans-serif'
        }
      }
    };

    return {
      data: data,
      layout: layout
    };
  }

  var initialRedBand = 4;
  var initialGreenBand = 3;
  var initialBlueBand = 2;

  layer = new ImageryLayer({
    url: 'https://landsat.arcgis.com/arcgis/rest/services/Landsat8_Views/ImageServer',
    // renderingRule: rasterFunctionNone,
    renderingRule: createExtractAndStretchRasterFunction([initialRedBand, initialGreenBand, initialBlueBand]),
    pixelFilter: pixelFilter,
    format: 'lerc'
  });

  layer.when(function () {
    // view.goTo(layer.fullExtent);

    for (var index = 0; index < layer.bandCount; index++) {
      var redOption = document.createElement('option');
      redOption.value = index;
      // JSAPI raster bands start at index 0,
      // and we want to display the optiont text starting with "Band 0"
      redOption.text = 'Band ' + index;
      redBandSelectNode.add(redOption);

      var greenOption = document.createElement('option');
      greenOption.value = index;
      // JSAPI raster bands start at index 0,
      // and we want to display the optiont text starting with "Band 0"
      greenOption.text = 'Band ' + index;
      greenBandSelectNode.add(greenOption);

      var blueOption = document.createElement('option');
      blueOption.value = index;
      // JSAPI raster bands start at index 0,
      // and we want to display the optiont text starting with "Band 0"
      blueOption.text = 'Band ' + index;
      blueBandSelectNode.add(blueOption);
    }

    redBandSelectNode.selectedIndex = initialRedBand;
    greenBandSelectNode.selectedIndex = initialGreenBand;
    blueBandSelectNode.selectedIndex = initialBlueBand;

    redBandSelectNode.addEventListener('input', function() {
      layer.renderingRule = createExtractAndStretchRasterFunction(
        [
          Number(redBandSelectNode.value),
          Number(greenBandSelectNode.value),
          Number(blueBandSelectNode.value)
        ]
      );
    });

    greenBandSelectNode.addEventListener('input', function() {
      layer.renderingRule = createExtractAndStretchRasterFunction(
        [
          Number(redBandSelectNode.value),
          Number(greenBandSelectNode.value),
          Number(blueBandSelectNode.value)
        ]
      );
    });

    blueBandSelectNode.addEventListener('input', function() {
      layer.renderingRule = createExtractAndStretchRasterFunction(
        [
          Number(redBandSelectNode.value),
          Number(greenBandSelectNode.value),
          Number(blueBandSelectNode.value)
        ]
      );
    });
  });

  view.map.add(layer);

  // toggle visibility of the loading indicator when the imagery layerview is updating
  var statusNode = document.querySelector('#status');
  view
    .whenLayerView(layer)
    .then(function (layerView) {
      layerView.watch('updating', function (updating) {
        if (updating) {
          statusNode.style.opacity = 1;
        } else {
          statusNode.style.opacity = 0;
        }
      });
    });

  var redBandSelectNode = document.querySelector('#redBandSelect');
  var greenBandSelectNode = document.querySelector('#greenBandSelect');
  var blueBandSelectNode = document.querySelector('#blueBandSelect');

  var chartTypeSelectNode = document.querySelector('#chartTypeSelect');
  var chartType = chartTypeSelectNode.value;
  chartTypeSelectNode.addEventListener('input', function (evt) {
    chartType = evt.target.value;
    pixelFilter(pixelDataCurrent);
  });
});
