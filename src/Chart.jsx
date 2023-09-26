import {
  lightningChart,
  Themes,
  emptyLine,
  AutoCursorModes,
  AxisTickStrategies,
  ColorHEX,
  SolidFill,
} from "@arction/lcjs";
import { useEffect } from "react";

const Chart = () => {
  useEffect(() => {
    const dashboard = lightningChart();
    console.log(dashboard);
    const theme = dashboard.getTheme();
    const ecgBackgroundFill = new SolidFill({
      color: theme.isDark ? ColorHEX("#000000") : ColorHEX("#ffffff"),
    });
  }, []);

  return <div>Chart</div>;
};

export default Chart;
