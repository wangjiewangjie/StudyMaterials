import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, theme as antdTheme, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App.jsx';
import './index.css';

// Cinema Dark Theme — 琥珀橙主色 #FF9900 + 纯黑影院级背景
const ORANGE = '#FF9900';
const ORANGE_LIGHT = '#ffaa22';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: antdTheme.darkAlgorithm,
        token: {
          colorPrimary: ORANGE,
          colorPrimaryHover: ORANGE_LIGHT,
          colorPrimaryActive: '#e68a00',
          colorBgBase: '#050505',
          colorBgContainer: '#141416',
          colorBgElevated: '#1A1A1A',
          colorBgLayout: '#050505',
          colorBorder: 'rgba(255,255,255,0.10)',
          colorBorderSecondary: 'rgba(255,255,255,0.05)',
          colorSplit: 'rgba(255,255,255,0.06)',
          borderRadius: 6,
          borderRadiusLG: 8,
          borderRadiusSM: 4,
          borderRadiusXS: 2,
          // 控件高度三档：small 28 / middle 32 / large 40
          controlHeight: 32,
          controlHeightSM: 28,
          controlHeightLG: 40,
          fontSize: 14,
          colorLink: ORANGE,
          colorLinkHover: ORANGE_LIGHT,
          colorText: '#e6e6e6',
          colorTextSecondary: '#cccccc',
          colorTextTertiary: '#999999',
          colorTextQuaternary: '#666666',
          colorInfo: ORANGE,
          colorInfoBg: 'rgba(255, 153, 0, 0.10)',
          colorInfoBorder: 'rgba(255, 153, 0, 0.30)',
        },
        components: {
          Layout: {
            headerBg: '#0A0A0A',
            bodyBg: '#050505',
            headerHeight: 64,
            headerPadding: '0 22px',
            headerColor: '#ffffff',
          },
          Card: {
            colorBgContainer: '#121212',
            headerBg: 'transparent',
            colorBorderSecondary: 'rgba(255,255,255,0.05)',
            actionsBg: 'transparent',
          },
          Modal: {
            contentBg: '#121213',
            headerBg: 'transparent',
            titleColor: '#ffffff',
            colorBorderSecondary: 'rgba(255,255,255,0.06)',
          },
          Tag: {
            defaultBg: '#1a1a1e',
            defaultColor: '#bbbbbb',
          },
          Input: {
            colorBgContainer: '#141416',
            colorBorder: 'rgba(255,255,255,0.10)',
            activeBorderShadow: '0 0 0 2px rgba(255, 153, 0, 0.12)',
            hoverBorderColor: 'rgba(255, 153, 0, 0.45)',
            activeBorderColor: 'rgba(255, 153, 0, 0.55)',
            paddingBlock: 4,
            paddingInline: 11,
          },
          InputNumber: {
            colorBgContainer: '#141416',
            colorBorder: 'rgba(255,255,255,0.10)',
          },
          Button: {
            colorPrimary: ORANGE,
            colorPrimaryHover: ORANGE_LIGHT,
            colorPrimaryActive: '#e68a00',
            colorBgContainer: '#1a1a1e',
            colorBorder: 'rgba(255,255,255,0.10)',
            defaultBg: '#1a1a1e',
            paddingInline: 14,
            contentFontSize: 13,
            contentFontSizeSM: 12,
            contentFontSizeLG: 14,
          },
          Segmented: {
            trackBg: '#1a1a1e',
            itemSelectedBg: '#2a2a2e',
          },
          Select: {
            colorBgContainer: '#1a1a1e',
            colorBorder: 'rgba(255,255,255,0.10)',
            optionSelectedBg: 'rgba(255, 153, 0, 0.15)',
            optionSelectedColor: ORANGE,
            colorBgElevated: '#141416',
          },
          Switch: {
            colorPrimary: ORANGE,
          },
          Dropdown: {
            colorBgElevated: '#141416',
            colorBorderSecondary: 'rgba(255,255,255,0.08)',
          },
          Popover: {
            colorBgElevated: '#141416',
            colorBorderSecondary: 'rgba(255,255,255,0.08)',
          },
          Pagination: {
            colorBgContainer: '#1a1a1e',
            colorBorder: 'rgba(255,255,255,0.08)',
            colorPrimary: ORANGE,
            itemActiveBg: ORANGE,
          },
          Tooltip: {
            colorBgDefault: '#141416',
          },
          Empty: {
            colorTextDescription: '#777777',
          },
        },
      }}
    >
      <AntdApp>
        <App />
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>
);
