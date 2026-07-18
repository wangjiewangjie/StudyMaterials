/*
 * @Author: wangjie
 * @Date: 2026-07-11 21:05:29
 * @LastEditTime: 2026-07-13 21:22:14
 * @LastEditors: wangjie
 * @Description: 
 * @FilePath: \Scrape\frontend\src\main.jsx
 * 
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, theme as antdTheme, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App.jsx';
import './index.css';

// Orange accent matching the original "学习资料" brand color.
const ORANGE = '#ff9000';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: antdTheme.darkAlgorithm,
        token: {
          colorPrimary: ORANGE,
          colorBgBase: '#1b1b1b',
          colorBgContainer: '#232323',
          colorBgElevated: '#262626',
          colorBorder: '#3a3a3a',
          colorBorderSecondary: '#2a2a2a',
          borderRadius: 6,
          colorLink: ORANGE,
        },
        components: {
          Layout: {
            headerBg: '#000000',
            bodyBg: '#1b1b1b',
            headerHeight: 56,
            headerPadding: '0 22px',
          },
          Card: {
            colorBgContainer: '#232323',
            headerBg: 'transparent',
          },
          Modal: {
            contentBg: '#1b1b1b',
            headerBg: '#1b1b1b',
            titleColor: '#ffffff',
          },
          Tag: { defaultBg: '#2a2a2a' },
          Input: { colorBgContainer: '#1b1b1b' },
          Menu: { itemBg: '#000000' },
        },
      }}
    >
      <AntdApp>
        <App />
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>
);
