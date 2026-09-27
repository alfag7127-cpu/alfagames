import { Component } from '@angular/core';
import { ToastService } from '../core/toast.service';

@Component({
  selector: 'app-toast-container',
  imports: [],
  templateUrl: './toast-container.html',
  styleUrl: './toast-container.css',
})
export class ToastContainer {
  constructor(readonly toast: ToastService) {}
}
