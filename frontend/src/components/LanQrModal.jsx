/**
 * LanQrModal — 局域网扫码访问弹窗
 *
 * 打开时请求 /api/access-info，展示 QR + 可复制 URL；多网卡时用 Segmented 切换。
 * 依赖：电脑与手机同一局域网；Windows 防火墙需放行本程序入站。
 */

import { useCallback, useEffect, useState } from 'react';
import { Modal, Button, QRCode, Spin, App as AntdApp, Segmented } from 'antd';
import { QrcodeOutlined, CopyOutlined, CloseOutlined, ReloadOutlined } from '@ant-design/icons';
import { fetchAccessInfo } from '../services/api.js';

export default function LanQrModal({ open, onClose }) {
  const { message } = AntdApp.useApp();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [urls, setUrls] = useState([]);
  const [activeUrl, setActiveUrl] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAccessInfo();
      const list = Array.isArray(data?.urls) ? data.urls.filter(Boolean) : [];
      setUrls(list);
      setActiveUrl((prev) => (list.includes(prev) ? prev : (list[0] || '')));
      if (!list.length) {
        setError('未检测到局域网 IP。请确认电脑已连 Wi‑Fi，并与手机在同一网络。');
      }
    } catch (e) {
      setUrls([]);
      setActiveUrl('');
      setError(e?.message || '获取访问地址失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    load();
    return undefined;
  }, [open, load]);

  const handleCopy = async () => {
    if (!activeUrl) return;
    try {
      await navigator.clipboard.writeText(activeUrl);
      message.success('已复制链接');
    } catch (_) {
      message.error('复制失败，请手动长按选择地址');
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={420}
      style={{ maxWidth: 'calc(100vw - 32px)' }}
      destroyOnClose
      centered
      closable={false}
      modalRender={(node) => (
        <div className="relative w-full bg-ph-header border border-white/10 rounded-lg shadow-2xl shadow-black overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-ph-orange via-ph-orange-light to-ph-orange" />
          {node}
        </div>
      )}
    >
      <div className="p-5 sm:p-6 border-b border-white/5 flex items-start justify-between gap-4">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="text-ph-orange text-xl mt-0.5 shrink-0" aria-hidden="true">
            <QrcodeOutlined />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-black text-white m-0">扫码用手机打开</h2>
            <p className="text-xs text-gray-400 mt-1 mb-0">
              手机连同一 Wi‑Fi，用相机或浏览器扫码即可访问
            </p>
          </div>
        </div>
        <Button
          type="text"
          size="middle"
          onClick={onClose}
          icon={<CloseOutlined style={{ fontSize: 14 }} />}
          className="!text-gray-400 hover:!text-white shrink-0 !border-0 !bg-transparent"
          aria-label="关闭"
        />
      </div>

      <div className="p-5 sm:p-6 flex flex-col items-center gap-4">
        {loading ? (
          <div className="py-10">
            <Spin size="large" />
          </div>
        ) : error && !activeUrl ? (
          <div className="w-full text-center space-y-4 py-4">
            <p className="text-sm text-ph-text-muted m-0 leading-relaxed">{error}</p>
            <Button
              icon={<ReloadOutlined />}
              onClick={load}
              className="!bg-ph-orange/10 !border-ph-orange/30 !text-ph-orange hover:!bg-ph-orange/20 !font-bold"
            >
              重新检测
            </Button>
          </div>
        ) : (
          <>
            {urls.length > 1 && (
              <Segmented
                size="small"
                value={activeUrl}
                onChange={setActiveUrl}
                options={urls.map((u) => ({
                  label: u.replace(/^https?:\/\//, ''),
                  value: u,
                }))}
                className="max-w-full overflow-x-auto"
              />
            )}

            <div className="rounded-lg bg-white p-3 shadow-inner">
              <QRCode
                value={activeUrl || 'about:blank'}
                size={200}
                errorLevel="M"
                bgColor="#ffffff"
                color="#000000"
              />
            </div>

            <div className="w-full text-center space-y-2">
              <p className="text-sm text-white font-mono break-all m-0 select-all">{activeUrl}</p>
              <div className="flex items-center justify-center gap-2">
                <Button
                  size="middle"
                  icon={<CopyOutlined />}
                  onClick={handleCopy}
                  className="!bg-ph-orange hover:!bg-ph-orange-light !text-black !border-0 !font-bold"
                >
                  复制链接
                </Button>
                <Button
                  size="middle"
                  icon={<ReloadOutlined />}
                  onClick={load}
                  className="!bg-white/5 !border-white/10 !text-ph-text-muted hover:!text-white !font-bold"
                >
                  刷新
                </Button>
              </div>
              <p className="text-[11px] text-ph-text-tertiary m-0 leading-relaxed">
                若扫码打不开，请检查 Windows 防火墙是否允许本程序入站
              </p>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
