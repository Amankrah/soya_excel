from django.apps import AppConfig


class ClientsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'clients'
    verbose_name = 'Clients & Orders'

    def ready(self):
        """
        Import signals and perform startup tasks when Django starts
        """
        # Import signals here if needed in the future
        # from . import signals
        pass
