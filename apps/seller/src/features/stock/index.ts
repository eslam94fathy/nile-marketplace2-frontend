// Public interface of the seller stock feature (spec 02 SE-12, SE-13). It never imports the products
// feature: the variants table opens the dialog and gives it the stock it read (one-way dependency).
export { stockKeys, type StockLevel, type VariantStock } from './api';
export { STOCK_COPY } from './copy';
export { StockAdjustDialog, type StockAdjustDialogProps } from './components/stock-adjust-dialog';
export { StockHistory } from './components/stock-history';
