"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _test = require("@playwright/test");
var _default = exports.default = (0, _test.defineConfig)({
  testDir: "./tests",
  timeout: 10 * 60 * 1000,
  expect: {
    timeout: 60 * 1000
  },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "npm run dev -w @experiments/web -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 120 * 1000
  },
  projects: [{
    name: "chromium",
    use: {
      ..._test.devices["Desktop Chrome"]
    }
  }]
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfdGVzdCIsInJlcXVpcmUiLCJfZGVmYXVsdCIsImV4cG9ydHMiLCJkZWZhdWx0IiwiZGVmaW5lQ29uZmlnIiwidGVzdERpciIsInRpbWVvdXQiLCJleHBlY3QiLCJmdWxseVBhcmFsbGVsIiwicmV0cmllcyIsIndvcmtlcnMiLCJ1c2UiLCJiYXNlVVJMIiwidHJhY2UiLCJ3ZWJTZXJ2ZXIiLCJjb21tYW5kIiwidXJsIiwicmV1c2VFeGlzdGluZ1NlcnZlciIsInByb2plY3RzIiwibmFtZSIsImRldmljZXMiXSwic291cmNlcyI6WyJwbGF5d3JpZ2h0LmNvbmZpZy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBkZWZpbmVDb25maWcsIGRldmljZXMgfSBmcm9tIFwiQHBsYXl3cmlnaHQvdGVzdFwiO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICB0ZXN0RGlyOiBcIi4vdGVzdHNcIixcbiAgdGltZW91dDogMTAgKiA2MCAqIDEwMDAsXG4gIGV4cGVjdDoge1xuICAgIHRpbWVvdXQ6IDYwICogMTAwMCxcbiAgfSxcbiAgZnVsbHlQYXJhbGxlbDogZmFsc2UsXG4gIHJldHJpZXM6IDAsXG4gIHdvcmtlcnM6IDEsXG4gIHVzZToge1xuICAgIGJhc2VVUkw6IFwiaHR0cDovLzEyNy4wLjAuMTo0MTczXCIsXG4gICAgdHJhY2U6IFwicmV0YWluLW9uLWZhaWx1cmVcIixcbiAgfSxcbiAgd2ViU2VydmVyOiB7XG4gICAgY29tbWFuZDogXCJucG0gcnVuIGRldiAtdyBAZXhwZXJpbWVudHMvd2ViIC0tIC0taG9zdCAxMjcuMC4wLjEgLS1wb3J0IDQxNzNcIixcbiAgICB1cmw6IFwiaHR0cDovLzEyNy4wLjAuMTo0MTczXCIsXG4gICAgcmV1c2VFeGlzdGluZ1NlcnZlcjogdHJ1ZSxcbiAgICB0aW1lb3V0OiAxMjAgKiAxMDAwLFxuICB9LFxuICBwcm9qZWN0czogW1xuICAgIHtcbiAgICAgIG5hbWU6IFwiY2hyb21pdW1cIixcbiAgICAgIHVzZTogeyAuLi5kZXZpY2VzW1wiRGVza3RvcCBDaHJvbWVcIl0gfSxcbiAgICB9LFxuICBdLFxufSk7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLElBQUFBLEtBQUEsR0FBQUMsT0FBQTtBQUF5RCxJQUFBQyxRQUFBLEdBQUFDLE9BQUEsQ0FBQUMsT0FBQSxHQUUxQyxJQUFBQyxrQkFBWSxFQUFDO0VBQzFCQyxPQUFPLEVBQUUsU0FBUztFQUNsQkMsT0FBTyxFQUFFLEVBQUUsR0FBRyxFQUFFLEdBQUcsSUFBSTtFQUN2QkMsTUFBTSxFQUFFO0lBQ05ELE9BQU8sRUFBRSxFQUFFLEdBQUc7RUFDaEIsQ0FBQztFQUNERSxhQUFhLEVBQUUsS0FBSztFQUNwQkMsT0FBTyxFQUFFLENBQUM7RUFDVkMsT0FBTyxFQUFFLENBQUM7RUFDVkMsR0FBRyxFQUFFO0lBQ0hDLE9BQU8sRUFBRSx1QkFBdUI7SUFDaENDLEtBQUssRUFBRTtFQUNULENBQUM7RUFDREMsU0FBUyxFQUFFO0lBQ1RDLE9BQU8sRUFBRSxpRUFBaUU7SUFDMUVDLEdBQUcsRUFBRSx1QkFBdUI7SUFDNUJDLG1CQUFtQixFQUFFLElBQUk7SUFDekJYLE9BQU8sRUFBRSxHQUFHLEdBQUc7RUFDakIsQ0FBQztFQUNEWSxRQUFRLEVBQUUsQ0FDUjtJQUNFQyxJQUFJLEVBQUUsVUFBVTtJQUNoQlIsR0FBRyxFQUFFO01BQUUsR0FBR1MsYUFBTyxDQUFDLGdCQUFnQjtJQUFFO0VBQ3RDLENBQUM7QUFFTCxDQUFDLENBQUMiLCJpZ25vcmVMaXN0IjpbXX0=