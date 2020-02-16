require([
  'esri/Map',
  'esri/views/MapView',
  'esri/layers/ImageryLayer',
  'esri/layers/support/RasterFunction',
  'esri/widgets/Search'
], function (
  Map,
  MapView,
  ImageryLayer,
  RasterFunction,
  Search
) {
  var view = new MapView({
    container: 'viewDiv',
    map: new Map({
      basemap: 'dark-gray'
    }),
    zoom: 8,
    center: [-122, 46.5]
  });

  view.ui.add(new Search({
    view: view,
    popupEnabled: false,
    resultGraphicEnabled: false
  }), 'top-right');

  // set the rendering rule to the 'None' raster function
  // this will allow us to gain access to the raw values assigned to each pixel
  // var rasterFunctionNone = new RasterFunction({
  //   functionName: 'None'
  // });

  // set the rendering rule to a chained server-side raster function
  // only 3 bands at a time are extracted and then they are stretched with standard deviation and DRA.
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

  // store the current pixel data after every extent change so that
  // the charts can be changed without having to fetch the pixels again
  var pixelDataCurrent;
  function pixelFilter(pixelData) {
    if (
      pixelData === null ||
      pixelData.pixelBlock === null ||
      pixelData.pixelBlock.pixels === null
    ) {
      pixelDataCurrent = null;
      displayCount(null, null);
      Plotly.purge('chartDiv');
      return;
    }

    pixelDataCurrent = pixelData;

    var rgbaUint8ClampedArray = pixelData.pixelBlock.getAsRGBA();

    var chartData;
    if (chartType === 'histogram') {
      chartData = processDataForHistograms(rgbaUint8ClampedArray);
    } else {
      chartData = processDataFor3DCharts(rgbaUint8ClampedArray);
    }

    displayCount(pixelData.pixelBlock.width, pixelData.pixelBlock.height);

    updateChart(chartType, chartData.dataX, chartData.dataY, chartData.dataZ, chartData.colors);
  }

  function processDataForHistograms(rgbaUint8ClampedArray) {
    // loop through all the red, green, and blue pixel data
    // and store each observation in data space x, y, and z arrays for plotly

    var dataX = [];
    var dataY = [];
    var dataZ = [];

    for (var index = 0; index < rgbaUint8ClampedArray.length; index += 4) {
      var r = rgbaUint8ClampedArray[index];
      var g = rgbaUint8ClampedArray[index + 1];
      var b = rgbaUint8ClampedArray[index + 2];
      // var a = rgbaUint8ClampedArray[index + 3]; // if we ever needed the alpha

      dataX.push(r);
      dataY.push(g);
      dataZ.push(b);
    }

    return {
      dataX: dataX,
      dataY: dataY,
      dataZ: dataZ,
      colors: null // rgb() colors array only used by plotly 3D charts
    };
  }

  function processDataFor3DCharts(rgbaUint8ClampedArray) {
    // loop through all the red, green, and blue pixel data
    // and store each observation in data space x, y, and z arrays for plotly
    // also create rgb() colors for plotly 3D charts

    // NOTE: a Set is used to efficiently capture only once each unique combination of red, green, and blue

    var combinations = new Set();

    for (var index = 0; index < rgbaUint8ClampedArray.length; index += 4) {
      var r = rgbaUint8ClampedArray[index];
      var g = rgbaUint8ClampedArray[index + 1];
      var b = rgbaUint8ClampedArray[index + 2];
      // var a = rgbaUint8ClampedArray[index + 3]; // if we ever needed the alpha

      // a string representing the unique red, green, and blue combo will only be added once to the set
      combinations.add(r + ',' + g + ',' + b);
    }

    // unpack the set into x, y, z, and colors arrays for plotly
    var dataX = [];
    var dataY = [];
    var dataZ = [];
    var colors = [];

    combinations.forEach(function (v) {
      var rgb = v.split(',');
      dataX.push(rgb[0]);
      dataY.push(rgb[1]);
      dataZ.push(rgb[2]);
      colors.push('rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')')
    });

    return {
      dataX: dataX,
      dataY: dataY,
      dataZ: dataZ,
      colors: colors
    };
  }

  function displayCount(w, h) {
    if (!w || !h) {
      document.querySelector('#countInfo').innerText = '';
      return;
    }

    document.querySelector('#countInfo').innerText = [
      'charted ',
      (w * h),
      ' pixel color values (',
      w,
      'w x ',
      h,
      'h)'
    ].join('');
  }

  function updateChart(chartType, dataX, dataY, dataZ, colors) {
    var chartInfo = getChartDataAndLayout(chartType, dataX, dataY, dataZ, colors);

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

  function getChartDataAndLayout(chartType, dataX, dataY, dataZ, colors) {
    // handle histograms chart type separately from 3D chart types
    if (chartType === 'histogram') {
      var data = [
        {
          x: dataX,
          type: 'histogram',
          name: 'Red (' + redBandSelectNode.options[redBandSelectNode.selectedIndex].text + ')',
          opacity: 0.55,
          marker: {
            color: 'red',
          }
        },
        {
          x: dataY,
          type: 'histogram',
          name: 'Green (' + greenBandSelectNode.options[greenBandSelectNode.selectedIndex].text + ')',
          opacity: 0.55,
          marker: {
            color: 'green',
          }
        },
        {
          x: dataZ,
          type: 'histogram',
          name: 'Blue (' + blueBandSelectNode.options[blueBandSelectNode.selectedIndex].text + ')',
          opacity: 0.55,
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
      x: dataX,
      y: dataY,
      z: dataZ,
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
      },

      uirevision: 'true'
    };

    return {
      data: data,
      layout: layout
    };
  }

  var initialRedBand = 4;
  var initialGreenBand = 3;
  var initialBlueBand = 2;

  var layer = new ImageryLayer({
    url: 'https://landsat.arcgis.com/arcgis/rest/services/Landsat8_Views/ImageServer',
    // renderingRule: rasterFunctionNone,
    renderingRule: createExtractAndStretchRasterFunction([initialRedBand, initialGreenBand, initialBlueBand]),
    pixelFilter: pixelFilter,
    format: 'lerc'
  });

  layer.when(function () {
    for (var index = 0; index < layer.bandCount; index++) {
      var redOption = document.createElement('option');
      redOption.value = index;
      // JSAPI raster bands start at index 0,
      // and we want to display the optiont text starting with "Band 0"
      redOption.text = 'Band ' + (index + 1);
      redBandSelectNode.add(redOption);

      var greenOption = document.createElement('option');
      greenOption.value = index;
      // JSAPI raster bands start at index 0,
      // and we want to display the optiont text starting with "Band 0"
      greenOption.text = 'Band ' + (index + 1);
      greenBandSelectNode.add(greenOption);

      var blueOption = document.createElement('option');
      blueOption.value = index;
      // JSAPI raster bands start at index 0,
      // and we want to display the optiont text starting with "Band 0"
      blueOption.text = 'Band ' + (index + 1);
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

  document.querySelector('#trueColorButton').addEventListener('click', function () {
    redBandSelectNode.selectedIndex = 3;
    greenBandSelectNode.selectedIndex = 2;
    blueBandSelectNode.selectedIndex = 1;

    layer.renderingRule = createExtractAndStretchRasterFunction(
      [
        Number(redBandSelectNode.value),
        Number(greenBandSelectNode.value),
        Number(blueBandSelectNode.value)
      ]
    );
  });

  document.querySelector('#nirButton').addEventListener('click', function () {
    redBandSelectNode.selectedIndex = 4;
    greenBandSelectNode.selectedIndex = 3;
    blueBandSelectNode.selectedIndex = 2;

    layer.renderingRule = createExtractAndStretchRasterFunction(
      [
        Number(redBandSelectNode.value),
        Number(greenBandSelectNode.value),
        Number(blueBandSelectNode.value)
      ]
    );
  });

  document.querySelector('#urbanButton').addEventListener('click', function () {
    redBandSelectNode.selectedIndex = 6;
    greenBandSelectNode.selectedIndex = 5;
    blueBandSelectNode.selectedIndex = 3;

    layer.renderingRule = createExtractAndStretchRasterFunction(
      [
        Number(redBandSelectNode.value),
        Number(greenBandSelectNode.value),
        Number(blueBandSelectNode.value)
      ]
    );
  });

  var chartTypeSelectNode = document.querySelector('#chartTypeSelect');
  var chartType = chartTypeSelectNode.value;
  chartTypeSelectNode.addEventListener('input', function (evt) {
    chartType = evt.target.value;
    pixelFilter(pixelDataCurrent);
  });
});
