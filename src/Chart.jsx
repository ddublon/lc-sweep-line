import {
  lightningChart,
  Themes,
  emptyLine,
  AutoCursorModes,
  AxisTickStrategies,
  ColorHEX,
  SolidFill,
  AxisScrollStrategies,
  disableThemeEffects,
} from "@arction/lcjs";
import { HubConnectionBuilder } from "@microsoft/signalr";

import { useEffect } from "react";

const Chart = () => {
  useEffect(() => {
    const startConnection = async () => {
      const connection = new HubConnectionBuilder()
        .withUrl("http://localhost:5049/hubs/refresh")
        .withAutomaticReconnect()
        .build();
      await connection.start();
      return connection;
    };
    const connection = startConnection();

    const CONFIG = {
      timeDomain: 5000,
      channels: 1,
      sampleRate: 44_000,
    };

    const columns = 1;
    const rows = 1;

    const dashboard = lightningChart({})
      .Dashboard({
        numberOfColumns: columns,
        numberOfRows: rows,
        theme: disableThemeEffects(Themes.darkGold),
        // TODO: If no interactions are needed at all, hard disabling them can also increase performance.
        interactable: false,
      })
      .setSplitterStyle(emptyLine);

    const theme = dashboard.getTheme();
    const ecgBackgroundFill = new SolidFill({
      color: theme.isDark ? ColorHEX("#000000") : ColorHEX("#ffffff"),
    });

    const channels = new Array(CONFIG.channels).fill(0).map((_, i) => {
      const column = i % 3;
      const row = Math.floor(i / 3);
      const chart = dashboard
        .createChartXY({ columnIndex: column, rowIndex: row })
        .setTitle("")
        .setPadding(3)
        .setAutoCursorMode(AutoCursorModes.disabled)
        .setSeriesBackgroundStrokeStyle(emptyLine)
        .setSeriesBackgroundFillStyle(ecgBackgroundFill);
      chart.forEachAxis((axis) =>
        axis.setTickStrategy(AxisTickStrategies.Empty).setStrokeStyle(emptyLine)
      );
      const axisX = chart
        .getDefaultAxisX()
        .setScrollStrategy(undefined)
        .setInterval({ start: 0, end: CONFIG.timeDomain })
        .setVisible(false);
      const axisY = chart
        .getDefaultAxisY()
        .setScrollStrategy(AxisScrollStrategies.expansion)
        .setVisible(false);

      // Series for displaying "old" data.
      const seriesRight = chart.addLineSeries({
        dataPattern: { pattern: "ProgressiveX" },
        automaticColorIndex: i,
      });

      // Rectangle for hiding "old" data under incoming "new" data.
      const seriesOverlayRight = chart.addRectangleSeries();
      const figureOverlayRight = seriesOverlayRight
        .add({ x1: 0, y1: 0, x2: 0, y2: 0 })
        .setFillStyle(ecgBackgroundFill)
        .setStrokeStyle(emptyLine);

      // Series for displaying new data.
      const seriesLeft = chart.addLineSeries({
        dataPattern: { pattern: "ProgressiveX" },
        automaticColorIndex: i,
      });

      // TODO: They can try switching between line thickness 1 and -1
      // -1 should be easier on GPU load.
      // seriesLeft.setStrokeStyle((stroke) => stroke.setThickness(1))
      // seriesRight.setStrokeStyle((stroke) => stroke.setThickness(1))
      seriesLeft.setStrokeStyle((stroke) => stroke.setThickness(-1));
      seriesRight.setStrokeStyle((stroke) => stroke.setThickness(-1));

      return {
        chart,
        axisX,
        axisY,
        seriesLeft,
        seriesRight,
        seriesOverlayRight,
        figureOverlayRight,
        prevPosX: 0,
        newDataCache: [],
      };
    });
    if (connection) {
      //  if the connectoin established, then we can start listening to the events
      connection.on("ReceiveMessage", (message) => {
        console.log(message);
        // TODO Here I get an array of values for the Y axis, but I don't know how to add them to the chart

      });
    }
  }, []);

  return <div>Chart</div>;
};

export default Chart;
