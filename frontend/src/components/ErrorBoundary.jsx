import React from 'react';
import { Result, Button } from 'antd';

/**
 * ErrorBoundary — 捕获子组件未处理的渲染错误，防止整页白屏。
 * 展示友好提示 + 刷新按钮，避免用户看到 React 堆栈报错。
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-ph-bg">
          <Result
            status="error"
            title="页面出错了"
            subTitle={this.state.error ? this.state.error.message : '发生了未知错误'}
            extra={[
              <Button key="reset" type="default" onClick={this.handleReset}>
                重试
              </Button>,
              <Button key="reload" type="primary" onClick={this.handleReload}>
                刷新页面
              </Button>,
            ]}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
