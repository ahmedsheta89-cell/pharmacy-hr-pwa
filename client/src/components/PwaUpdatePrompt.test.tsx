// @vitest-environment jsdom
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PwaUpdatePrompt from "./PwaUpdatePrompt";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("إشعار تحديث PWA", () => {
  it("يظهر عند وصول حدث تحديث ويرسل طلب التفعيل الفوري إلى عامل الخدمة المنتظر", () => {
    const postMessage = vi.fn();
    const addEventListener = vi.fn();
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { addEventListener } });
    render(<PwaUpdatePrompt />);

    act(() => {
      window.dispatchEvent(new CustomEvent("pwa:update-available", { detail: { registration: { waiting: { postMessage } } } }));
    });

    expect(screen.getByText("يتوفر تحديث جديد")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "تحديث الآن" }));
    expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(addEventListener).toHaveBeenCalledWith("controllerchange", expect.any(Function), { once: true });
  });
});
