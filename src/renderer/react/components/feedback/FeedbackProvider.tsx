import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  InfoCircleOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { Modal, message } from "antd";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  FEEDBACK_NOTICE_DURATION_MS,
  FEEDBACK_NOTICE_MAX_COUNT,
  type FeedbackAlertOptions,
  type FeedbackApi,
  type FeedbackConfirmOptions,
  type FeedbackTone,
} from "../../../shared/feedback-types";
import "./Feedback.css";

const FeedbackContext = createContext<FeedbackApi | null>(null);

function toneIcon(tone: FeedbackTone): ReactNode {
  if (tone === "success") return <CheckCircleOutlined />;
  if (tone === "error") return <CloseCircleOutlined />;
  if (tone === "warning") return <WarningOutlined />;
  return <InfoCircleOutlined />;
}

function AlertBody({ message: body, details }: Pick<FeedbackAlertOptions, "message" | "details">) {
  return (
    <div className="cy-feedback-alert">
      <p>{body}</p>
      {details ? (
        <details>
          <summary>查看詳細資訊</summary>
          <pre>{details}</pre>
        </details>
      ) : null}
    </div>
  );
}

export function useFeedback(): FeedbackApi {
  const api = useContext(FeedbackContext);
  if (!api) throw new Error("useFeedback 必須在 FeedbackProvider 內使用");
  return api;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [modal, modalHolder] = Modal.useModal();
  const [messageApi, messageHolder] = message.useMessage({ maxCount: FEEDBACK_NOTICE_MAX_COUNT });
  const mounted = useRef(true);
  const blockingTail = useRef<Promise<void>>(Promise.resolve());
  const pendingSettlers = useRef(new Set<() => void>());

  useEffect(() => () => {
    mounted.current = false;
    for (const settle of pendingSettlers.current) settle();
    pendingSettlers.current.clear();
  }, []);

  const enqueue = useCallback(<T,>(open: () => Promise<T>, fallback: T): Promise<T> => {
    const run = () => mounted.current ? open() : Promise.resolve(fallback);
    const result = blockingTail.current.then(run, run);
    blockingTail.current = result.then(() => undefined, () => undefined);
    return result;
  }, []);

  const openConfirm = useCallback((options: FeedbackConfirmOptions): Promise<boolean> => (
    new Promise((resolve) => {
      let settled = false;
      const settle = (value: boolean) => {
        if (settled) return;
        settled = true;
        pendingSettlers.current.delete(cancel);
        resolve(value);
      };
      const cancel = () => settle(false);
      pendingSettlers.current.add(cancel);
      modal.confirm({
        title: options.title,
        content: options.message,
        icon: toneIcon(options.tone ?? (options.dangerous ? "error" : "warning")),
        okText: options.confirmText ?? "確定",
        cancelText: options.cancelText ?? "取消",
        maskClosable: false,
        autoFocusButton: options.dangerous ? "cancel" : "ok",
        okButtonProps: options.dangerous ? { danger: true } : undefined,
        rootClassName: "cy-feedback-modal",
        onOk: () => settle(true),
        onCancel: cancel,
      });
    })
  ), [modal]);

  const api = useMemo<FeedbackApi>(() => ({
    notice(options) {
      options.focusTarget?.focus();
      void messageApi.open({
        key: `${options.tone}:${options.message}`,
        type: options.tone,
        content: options.message,
        duration: (options.durationMs ?? FEEDBACK_NOTICE_DURATION_MS) / 1000,
        className: "cy-feedback-notice",
      });
    },
    alert(options) {
      return enqueue(() => new Promise<void>((resolve) => {
        const settle = () => {
          pendingSettlers.current.delete(settle);
          resolve();
        };
        pendingSettlers.current.add(settle);
        modal.info({
          title: options.title,
          content: <AlertBody message={options.message} details={options.details} />,
          icon: toneIcon(options.tone),
          okText: options.confirmText ?? "知道了",
          maskClosable: false,
          autoFocusButton: "ok",
          rootClassName: `cy-feedback-modal is-${options.tone}`,
          onOk: settle,
          onCancel: settle,
        });
      }), undefined);
    },
    confirm(options) {
      return enqueue(() => openConfirm(options), false);
    },
  }), [enqueue, messageApi, modal, openConfirm]);

  return (
    <FeedbackContext.Provider value={api}>
      {messageHolder}
      {modalHolder}
      {children}
    </FeedbackContext.Provider>
  );
}
