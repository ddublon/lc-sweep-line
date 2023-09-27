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
    }
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

    /**
     * newDataForAllChannels = Array< Array< { x: number, y: number } > >
     */
    const handleIncomingData = (newDataForAllChannels) => {
      channels.forEach((channel, iCh) => {
        // Keep track of the latest X (time position), clamped to the sweeping axis range.
        const newDataPointsTimestamped = newDataForAllChannels[iCh];
        if (newDataPointsTimestamped.length === 0) {
          return;
        }
        const prevPosX = channel.prevPosX;

        // NOTE: Incoming data points are timestamped, meaning their X coordinates can go outside sweeping axis interval.
        // Clamp timestamps onto the sweeping axis range.
        const newDataPointsSweeping = newDataPointsTimestamped.map((dp) => ({
          x: dp.x % CONFIG.timeDomain,
          y: dp.y,
        }));
        const posX = newDataPointsSweeping[newDataPointsSweeping.length - 1].x;

        // Check if the channel completes a full sweep (or even more than 1 sweep even though it can't be displayed).
        let fullSweepsCount = 0;
        let signPrev = false;
        for (const dp of newDataPointsSweeping) {
          const sign = dp.x < prevPosX;
          if (sign === true && sign !== signPrev) {
            fullSweepsCount += 1;
          }
          signPrev = sign;
        }

        if (fullSweepsCount > 1) {
          // The below algorithm is incapable of handling data input that spans over several full sweeps worth of data.
          // To prevent visual errors, reset sweeping graph and do not process the data.
          // This scenario is triggered when switching tabs or minimizing the example for extended periods of time.
          channel.seriesRight.clear();
          channel.seriesLeft.clear();
        } else if (fullSweepsCount === 1) {
          // Sweeping cycle is completed.
          // Categorize new data points into those belonging to current sweep and the next.
          const newDataPointsCurSweep = [];
          const newDataPointsNextSweep = [];
          for (const dp of newDataPointsSweeping) {
            if (dp.x > prevPosX) {
              newDataPointsCurSweep.push(dp);
            } else {
              newDataPointsNextSweep.push(dp);
            }
          }
          // Finish current sweep.
          channel.seriesLeft.add(newDataPointsCurSweep);
          // Swap left and right series.
          const nextLeft = channel.seriesRight;
          const nextRight = channel.seriesLeft;
          channel.seriesLeft = nextLeft;
          channel.seriesRight = nextRight;
          channel.seriesRight.setDrawOrder({ seriesDrawOrderIndex: 0 });
          channel.seriesOverlayRight.setDrawOrder({ seriesDrawOrderIndex: 1 });
          channel.seriesLeft.setDrawOrder({ seriesDrawOrderIndex: 2 });
          // Start sweeping from left again.
          channel.seriesLeft.clear().add(newDataPointsNextSweep);
        } else {
          // Append data to left.
          channel.seriesLeft.add(newDataPointsSweeping);
        }

        // Move overlay of old data to right locations.
        const overlayXStart = 0;
        const overlayXEnd = posX + CONFIG.timeDomain * 0.03;
        channel.figureOverlayRight.setDimensions({
          x1: overlayXStart,
          x2: overlayXEnd,
          y1: channel.axisY.getInterval().start,
          y2: channel.axisY.getInterval().end,
        });

        channel.prevPosX = posX;
      });
    };

    // Push random test data in
    (() => {
      let tLast = performance.now();
      let dModulus = 0;
      let yNext = 0;
      const pushData = () => {
        const tNow = performance.now();
        const tDelta = Math.min(tNow - tLast, 2000); // if tab is inactive for more than 2 seconds, prevent adding crazy amounts of data in attempt to catch up.
        let pointsToAdd = (tDelta * CONFIG.sampleRate) / 1000 + dModulus;
        dModulus = pointsToAdd % 1;
        pointsToAdd = Math.floor(pointsToAdd);

        const newDataForAllChannels = new Array(CONFIG.channels)
          .fill(0)
          .map((_) => []);
        for (let i = 0; i < pointsToAdd; i += 1) {
          const x = tLast + ((i + 1) / pointsToAdd) * tDelta;
          const y = yNext;
          yNext = (yNext + 1) % 10000;
          const sample = { x, y };
          // NOTE: For testing purposes same data is used for every channel. This shouldn't impose any performance differences, since generating test data is only extra work that is not needed in real application.
          for (let ch = 0; ch < CONFIG.channels; ch += 1) {
            newDataForAllChannels[ch].push(sample);
          }
        }
        handleIncomingData(newDataForAllChannels);

        tLast = tNow;
        // NOTE: In normal cases, this would happen 60 times per second (depends on monitor). If app starts to lag, then it will happen less frequently.
        requestAnimationFrame(pushData);
      };
      requestAnimationFrame(pushData);
    })();

    // Measure FPS
    (() => {
      let frames = 0;
      let tPrevUpdate = performance.now();
      const _updt = () => {
        frames += 1;
        const tNow = performance.now();
        if (tNow - tPrevUpdate > 5000) {
          const fps = 1000 / ((tNow - tPrevUpdate) / frames);
          console.log("fps", fps.toFixed(1), "\n\n");
          frames = 0;
          tPrevUpdate = tNow;
        }
        requestAnimationFrame(_updt);
      };
      _updt();
    })();
  }, []);

  return <div>Chart</div>;
};

export default Chart;
