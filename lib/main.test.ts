import { describe, it, beforeEach, expect, vi } from "vitest";
import { setupCounter } from "./main";

describe("setupCounter", () => {
  let button: HTMLButtonElement;

  beforeEach(() => {
    if (typeof document === "undefined") {
      // @ts-ignore
      global.document = {
        createElement: (tag: string) => {
          let listeners: { [key: string]: Function[] } = {};
          return {
            tagName: tag.toUpperCase(),
            innerHTML: "",
            addEventListener: (event: string, cb: Function) => {
              listeners[event] = listeners[event] || [];
              listeners[event].push(cb);
            },
            click: () => {
              (listeners["click"] || []).forEach((cb) => cb());
            },
          };
        },
      };
    }
    button = document.createElement("button");
  });

  it("should set innerHTML to 'count is 0' after setup", () => {
    setupCounter(button);
    expect(button.innerHTML).toBe("count is 0");
  });

  it("should increment the counter on each click", () => {
    setupCounter(button);
    button.click();
    expect(button.innerHTML).toBe("count is 1");
    button.click();
    expect(button.innerHTML).toBe("count is 2");
  });
});
