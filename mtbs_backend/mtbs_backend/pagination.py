"""Shared pagination for the API.

DRF reads `PAGE_SIZE` from settings but not `page_size_query_param` or
`max_page_size` — those are class attributes, so they live here rather than
looking like settings that quietly do nothing.
"""
from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    page_size_query_param = 'page_size'
    # A caller that asks for everything shouldn't be able to undo pagination:
    # the cap is what stops one request from loading the whole table.
    max_page_size = 100
