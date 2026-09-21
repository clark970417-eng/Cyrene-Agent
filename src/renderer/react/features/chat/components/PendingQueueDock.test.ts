// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PendingQueueDock } from "./PendingQueueDock";

afterEach(cleanup);

describe("PendingQueueDock", () => {
  it("collapses multiple queued messages and reveals them on demand", () => {
    render(createElement(PendingQueueDock, { items: [{ id: "1", content: "第一則" }, { id: "2", content: "第二則" }] }));
    expect(screen.queryByText("第一則")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /待發送 2 則/ }));
    expect(screen.getByText("第一則")).toBeTruthy();
    expect(screen.getByText("第二則")).toBeTruthy();
  });

  it("edits with Enter and removes without changing sent messages", async () => {
    const onEdit = vi.fn().mockResolvedValue(true);
    const onRemove = vi.fn();
    render(createElement(PendingQueueDock, {
      items: [{ id: "q1", content: "原始內容", attachmentCount: 2 }],
      onEdit,
      onRemove,
    }));

    fireEvent.click(screen.getByRole("button", { name: "編輯訊息" }));
    const input = screen.getByRole("textbox", { name: "編輯待發送訊息" });
    fireEvent.change(input, { target: { value: "  更新內容  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    await vi.waitFor(() => expect(onEdit).toHaveBeenCalledWith("q1", "更新內容"));

    fireEvent.click(await screen.findByRole("button", { name: "移除訊息" }));
    expect(onRemove).toHaveBeenCalledWith("q1");
  });
});
