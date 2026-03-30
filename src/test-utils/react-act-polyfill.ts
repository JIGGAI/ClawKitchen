// React 19 compatibility fix for @testing-library/react
// React 19 removed React.act, but @testing-library/react still tries to use it
// This provides a proper act function from react-dom/test-utils

import { act } from "react-dom/test-utils";
 
import React from "react";

// Only add React.act if it doesn't exist (React 19+)
if (!React.act) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (React as any).act = act;
}